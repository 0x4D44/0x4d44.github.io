/* Database deck — entity-occurrence diagram, GROUP BY animation, live SQL playground. */
(function () {
  "use strict";
  const HC = window.HC;
  const el = HC.el;

  const SQUADRONS = [[1805, "Blockhaven", "North Wing", "Blockhaven"], [2212, "Creeperford", "North Wing", "Creeperford"], [2471, "Redstone Bay", "South Wing", "Redstone Bay"], [3110, "Obsidian Point", "South Wing", "Obsidian Point"]];
  const CADETS = [
    ["C101", "Ross", "Stewart", "Cadet", "2010-03-14", 1805, 12, 0],
    ["C102", "Ailsa", "MacLeod", "Sgt", "2009-06-02", 1805, 31, 1],
    ["C103", "Callum", "Paterson", "Cadet", "2011-01-20", 2212, 7, 0],
    ["C104", "Mhairi", "Campbell", "FS", "2008-11-30", 1805, 31, 1],
    ["C105", "Euan", "MacDonald", "Cpl", "2009-09-09", 2212, 19, 1],
    ["C106", "Isla", "Robertson", "Cadet", "2012-04-18", 2471, 4, 0],
    ["C107", "Kenzie", "Murray", "Cpl", "2010-07-07", 2212, 25, 1],
    ["C108", "Freya", "Henderson", "Cadet", "2011-05-25", 2471, 19, 0],
    ["C109", "Hamish", "Barr", "Sgt", "2009-02-11", 1805, 22, 1],
    ["C110", "Zara", "Ahmed", "Cadet", "2011-10-03", 2471, 9, 0],
    ["C111", "Lewis", "Marshall", "CWO", "2008-01-15", 3110, 40, 1],
    ["C112", "Niamh", "Doyle", "Cadet", "2012-08-08", 3110, 3, 0],
  ];
  const SHIPS = [["RED", "HMS Redstone", 1, 104, 1765, "Portsmouth"], ["OBS", "HMS Obsidian", 2, 98, 1782, "Plymouth"], ["LAP", "HMS Lapis", 3, 74, 1790, "Chatham"], ["GLO", "HMS Glowstone", 3, 74, 1797, "Leith"], ["PRI", "HMS Prismarine", 5, 38, 1801, "Leith"], ["COB", "HMS Cobblestone", 6, 24, 1806, "Portsmouth"]];
  const POSTINGS = [
    ["C101", "RED", "2026-07-04", 7, "Gunnery"], ["C102", "RED", "2026-07-04", 7, "Navigation"], ["C104", "RED", "2026-07-04", 7, "Signals"],
    ["C104", "LAP", "2026-08-15", 5, "Navigation"], ["C105", "OBS", "2026-06-20", 4, "Rigging"], ["C107", "OBS", "2026-06-20", 4, "Gunnery"],
    ["C109", "GLO", "2026-07-18", 6, "Signals"], ["C111", "GLO", "2026-07-18", 6, "Navigation"], ["C111", "PRI", "2026-09-05", 3, "Gunnery"],
    ["C103", "COB", "2026-08-01", 2, "Rigging"], ["C108", "PRI", "2026-09-05", 3, "Signals"], ["C110", "LAP", "2026-08-15", 5, "Rigging"],
    ["C112", "COB", "2026-08-01", 2, "Gunnery"],
  ];
  // every voyage has one muster time on the quayside (a Time attribute)
  const REPORT = { RED: "08:30", OBS: "07:45", LAP: "09:15", GLO: "10:00", PRI: "08:00", COB: "09:30" };
  const q = (v) => (typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  const SEED = `
CREATE TABLE Squadron (squadronNo INTEGER PRIMARY KEY, squadronName TEXT NOT NULL, wing TEXT, town TEXT);
CREATE TABLE Cadet (cadetID TEXT PRIMARY KEY, firstname TEXT NOT NULL, surname TEXT NOT NULL, rank TEXT, dateOfBirth TEXT, squadronNo INTEGER REFERENCES Squadron(squadronNo), flyingHours INTEGER, glidingWings BOOLEAN);
CREATE TABLE Ship (shipCode TEXT PRIMARY KEY, shipName TEXT NOT NULL, rate INTEGER, guns INTEGER, launched INTEGER, homePort TEXT);
CREATE TABLE Posting (cadetID TEXT REFERENCES Cadet(cadetID), shipCode TEXT REFERENCES Ship(shipCode), startDate TEXT, nights INTEGER, role TEXT, reportTime TEXT NOT NULL, PRIMARY KEY (cadetID, shipCode));
${SQUADRONS.map((r) => `INSERT INTO Squadron VALUES (${r.map(q).join(",")});`).join("\n")}
${CADETS.map((r) => `INSERT INTO Cadet VALUES (${r.map(q).join(",")});`).join("\n")}
${SHIPS.map((r) => `INSERT INTO Ship VALUES (${r.map(q).join(",")});`).join("\n")}
${POSTINGS.map((r) => `INSERT INTO Posting VALUES (${r.concat([REPORT[r[1]]]).map(q).join(",")});`).join("\n")}`;

  /* ============ Entity-occurrence diagram ============ */
  function eod(box) {
    const S = HC.svg;
    const svg = S("svg", { viewBox: "0 0 680 360", role: "img", "aria-label": "Entity-occurrence diagram. The text below describes the current view." });
    const note = el("p", { class: "stepper-note", "aria-live": "polite" });
    const views = {
      oto: "Squadron ⟷ Commanding officer",
      sq: "Squadron ⟷ Cadet",
      mn: "Cadet ⟷ Ship",
      res: "Resolved with Posting",
    };
    const row = el("div", { class: "btn-row", role: "group", "aria-label": "View" });
    const btns = {};
    Object.entries(views).forEach(([k, t]) => { const b = el("button", { class: "btn small", type: "button", "aria-pressed": "false" }, t); b.addEventListener("click", () => draw(k)); btns[k] = b; row.append(b); });
    box.append(row, el("div", { class: "diagram-scroll" }, svg), note);
    const cads = ["C101", "C102", "C104", "C105", "C107", "C109", "C111"];
    const ships = ["RED", "OBS", "LAP", "GLO", "PRI"];
    const sqs = ["1805", "2212", "3110"];
    const cadSq = { C101: "1805", C102: "1805", C104: "1805", C105: "2212", C107: "2212", C109: "1805", C111: "3110" };
    const posts = POSTINGS.filter((p) => cads.includes(p[0]) && ships.includes(p[1]));
    function oval(x, title, items, y0 = 50, gap = 38) {
      const h = items.length * gap + 30;
      let s = `<ellipse cx="${x}" cy="${y0 + h / 2}" rx="${items[0].length > 6 ? 70 : 46}" ry="${h / 2 + 10}" fill="var(--card)" stroke="var(--ink)" stroke-width="2"/>`;
      s += `<text x="${x}" y="${y0 - 14}" text-anchor="middle" class="px ink" font-size="15">${title}</text>`;
      items.forEach((it, i) => { s += `<text x="${x}" y="${y0 + 30 + i * gap}" text-anchor="middle" font-size="13" class="mono ink">${it}</text>`; });
      return { s, pos: (i) => y0 + 26 + i * gap };
    }
    function line(x1, y1, x2, y2, col, k) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (HC.reduced) return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2"/>`;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2" stroke-dasharray="${len}" stroke-dashoffset="${len}"><animate attributeName="stroke-dashoffset" from="${len}" to="0" dur=".6s" begin="${k * 0.08}s" fill="freeze"/></line>`;
    }
    function draw(v) {
      Object.entries(btns).forEach(([k, b]) => { b.classList.toggle("primary", k === v); b.setAttribute("aria-pressed", k === v ? "true" : "false"); });
      let s = "";
      if (v === "oto") {
        const sqAll = ["1805", "2212", "2471", "3110"], cos = ["CO17", "CO42", "CO08", "CO23"];
        const A = oval(150, "Squadron", sqAll, 70, 56), B = oval(520, "Commanding officer", cos, 70, 56);
        s += A.s + B.s;
        sqAll.forEach((q, i) => { s += line(196, A.pos(i), 474, B.pos(i), "var(--sea)", i); });
        note.innerHTML = "Every squadron has <b>exactly one</b> line, and so does every commanding officer: <b>one-to-one</b>. Each squadron is commanded by one, and only one, CO, and each CO commands one, and only one, squadron.";
      } else if (v === "sq") {
        const A = oval(140, "Squadron", sqs, 90, 60), B = oval(520, "Cadet", cads);
        s += A.s + B.s;
        cads.forEach((c, i) => { s += line(186, A.pos(sqs.indexOf(cadSq[c])), 474, B.pos(i), "var(--sea)", i); });
        note.innerHTML = "Each <b>squadron</b> occurrence links to <b>one or more</b> cadets, but every <b>cadet</b> has <b>exactly one</b> line, to their own squadron. That is <b>one-to-many</b>, so squadronNo goes into Cadet as a foreign key.";
      } else if (v === "mn") {
        const A = oval(140, "Cadet", cads), B = oval(540, "Ship", ships, 70, 50);
        s += A.s + B.s;
        posts.forEach((p, k) => { s += line(186, A.pos(cads.indexOf(p[0])), 494, B.pos(ships.indexOf(p[1])), "var(--redstone)", k); });
        note.innerHTML = "A cadet can be posted to <b>several</b> ships (C104, C111), and a ship takes <b>several</b> cadets (RED). Lines fan out from <b>both</b> sides: <b>many-to-many</b>. There is nowhere to put a single foreign key, so a relational database can't implement this directly.";
      } else {
        const A = oval(90, "Cadet", cads), C = oval(590, "Ship", ships, 70, 50);
        const P = oval(340, "Posting", posts.map((p) => p[0] + "+" + p[1]), 40, 30);
        s += A.s + C.s + P.s;
        posts.forEach((p, k) => {
          s += line(136, A.pos(cads.indexOf(p[0])), 272, P.pos(k), "var(--sea)", k);
          s += line(408, P.pos(k), 544, C.pos(ships.indexOf(p[1])), "var(--grass)", k + 3);
        });
        note.innerHTML = "Now each <b>Posting</b> occurrence has exactly <b>one</b> line to a cadet and <b>one</b> line to a ship. The tangle has become <b>two one-to-many relationships</b>: Cadet 1:M Posting and Ship 1:M Posting. Posting's compound key is cadetID + shipCode.";
      }
      svg.innerHTML = s;
    }
    draw("oto");
  }

  /* ============ GROUP BY animation ============ */
  function groupby(box) {
    const stage = el("div", { class: "gb-stage", "aria-hidden": "true" });
    const note = el("p", { class: "stepper-note", "aria-live": "polite" });
    const back = el("button", { class: "btn small", type: "button" }, "◀ Back");
    const next = el("button", { class: "btn small primary", type: "button" }, "Next ▶");
    const sqlBox = el("pre", { "data-lang": "SQL", class: "gb-sql" });
    const head = el("div", { class: "gb-head", "aria-hidden": "true" });
    box.append(sqlBox, el("div", { class: "btn-row" }, back, next), note, head, stage);
    const COLORS = { 1805: "#2f5f97", 2212: "#3f7426", 2471: "#8a5310", 3110: "#6b4fa0" };
    const rows = CADETS.map((c) => {
      const r = el("div", { class: "gb-row" }, el("span", null, c[0]), el("span", null, c[1]), el("span", { class: "gb-sq" }, String(c[5])));
      r.style.setProperty("--c", COLORS[c[5]]);
      stage.append(r);
      return { el: r, sq: c[5] };
    });
    const groups = Object.keys(COLORS).map((k) => {
      const g = el("div", { class: "gb-group" }, el("span", null, k), el("span", { class: "gb-count" }, String(rows.filter((r) => r.sq === +k).length)));
      g.style.setProperty("--c", COLORS[k]);
      stage.append(g);
      return { el: g, sq: +k, n: rows.filter((r) => r.sq === +k).length };
    });
    const STEPS = [
      { sql: "SELECT cadetID, firstname, squadronNo\nFROM Cadet;", note: "Start with every row in Cadet: 12 rows, one per cadet." },
      { sql: "SELECT squadronNo, COUNT(*)\nFROM Cadet\nGROUP BY squadronNo;", note: "<b>GROUP BY squadronNo</b> gathers together the rows that share the same squadronNo. There are four squadrons, so there are four groups." },
      { sql: "SELECT squadronNo, COUNT(*)\nFROM Cadet\nGROUP BY squadronNo;", note: "The aggregate <b>COUNT(*)</b> now runs <b>once for each group</b>, and each group collapses into a single result row. squadronNo is allowed in the SELECT list because it is the grouping field: it has one value per group." },
      { sql: "SELECT squadronNo, COUNT(*) AS [Cadets]\nFROM Cadet\nGROUP BY squadronNo\nORDER BY COUNT(*) DESC;", note: "<b>ORDER BY</b> comes <b>after</b> GROUP BY and sorts the finished groups, largest first. The alias gives the column a readable heading. (2212 and 2471 tie on 3, so they could come out in either order.)" },
    ];
    let i = 0;
    function layout() {
      const H = 30;
      if (i === 0) {
        stage.style.height = rows.length * H + 10 + "px";
        rows.forEach((r, k) => { Object.assign(r.el.style, { top: k * H + "px", opacity: 1, transform: "none" }); r.el.classList.remove("tinted"); });
        groups.forEach((g) => (g.el.style.opacity = 0));
      } else if (i === 1) {
        let y = 0; const order = [1805, 2212, 2471, 3110];
        order.forEach((sq) => { rows.filter((r) => r.sq === sq).forEach((r) => { Object.assign(r.el.style, { top: y + "px", opacity: 1, transform: "none" }); r.el.classList.add("tinted"); y += H; }); y += 12; });
        stage.style.height = y + "px";
        groups.forEach((g) => (g.el.style.opacity = 0));
      } else {
        const order = i === 3 ? groups.slice().sort((a, b) => b.n - a.n || a.sq - b.sq) : groups;
        order.forEach((g, k) => { Object.assign(g.el.style, { top: k * (H + 12) + "px", opacity: 1 }); });
        rows.forEach((r) => { const g = order.findIndex((x) => x.sq === r.sq); Object.assign(r.el.style, { top: g * (H + 12) + "px", opacity: 0 }); });
        stage.style.height = 4 * (H + 12) + "px";
      }
      head.textContent = i < 2 ? "cadetID · firstname · squadronNo" : i === 2 ? "squadronNo · COUNT(*)" : "squadronNo · Cadets";
      sqlBox.textContent = STEPS[i].sql; delete sqlBox.dataset.hl; HC.highlight(sqlBox);
      note.innerHTML = STEPS[i].note;
      back.disabled = i === 0; next.disabled = i === STEPS.length - 1;
    }
    back.addEventListener("click", () => { i--; layout(); });
    next.addEventListener("click", () => { i++; layout(); });
    layout();
  }

  /* ============ SQL playground ============ */
  const MISSIONS = [
    { t: "1 · The Mac clan", brief: "Display the firstname and surname of every cadet whose surname starts with <b>Mac</b>.", sol: `SELECT firstname, surname FROM Cadet WHERE surname LIKE "Mac%";`, hint: "Use LIKE with the % wildcard.", design: ["firstname, surname", "Cadet", 'surname LIKE "Mac%"', "", ""] },
    { t: "2 · Muster roll", brief: "Display surname, firstname and flyingHours for every cadet, with the most flying hours first. Where hours are equal, list surnames alphabetically.", sol: "SELECT surname, firstname, flyingHours FROM Cadet ORDER BY flyingHours DESC, surname ASC;", ordered: true, hint: "ORDER BY can take two fields, separated by a comma.", design: ["surname, firstname, flyingHours", "Cadet", "", "", "flyingHours DESC, surname ASC"] },
    { t: "3 · Two tables: North Wing", brief: "Display the firstname, surname and squadronName of every cadet in a squadron in <b>North Wing</b>.", sol: `SELECT firstname, surname, squadronName FROM Cadet, Squadron WHERE Cadet.squadronNo = Squadron.squadronNo AND wing = "North Wing";`, hint: "Both tables go in FROM, and the join goes in WHERE: Cadet.squadronNo = Squadron.squadronNo.", design: ["firstname, surname, squadronName", "Cadet, Squadron", 'wing = "North Wing"', "", ""] },
    { t: "4 · Three tables: July sailings", brief: "Display firstname, shipName and startDate for every posting that starts in <b>July 2026</b>, earliest first. Where dates are equal, list by firstname A–Z.", sol: `SELECT firstname, shipName, startDate FROM Cadet, Posting, Ship WHERE Cadet.cadetID = Posting.cadetID AND Posting.shipCode = Ship.shipCode AND startDate LIKE "2026-07-%" ORDER BY startDate ASC, firstname ASC;`, ordered: true, hint: "Three tables need two joins. Dates are stored as YYYY-MM-DD, so try LIKE \"2026-07-%\".", design: ["firstname, shipName, startDate", "Cadet, Posting, Ship", 'startDate LIKE "2026-07-%"', "", "startDate ASC, firstname ASC"] },
    { t: "5 · Weight of metal", brief: "Using readable headings <b>[Fewest guns]</b> and <b>[Most guns]</b>, display the smallest and largest number of guns on any ship.", sol: "SELECT MIN(guns) AS [Fewest guns], MAX(guns) AS [Most guns] FROM Ship;", headings: true, hint: "Two aggregate functions, each with an alias: AS [Fewest guns].", design: ["Fewest guns = MIN(guns), Most guns = MAX(guns)", "Ship", "", "", ""] },
    { t: "6 · Broadsides", brief: "For every ship with <b>more than 70</b> guns, display shipName and a computed column <b>[Guns per side]</b> (half the guns), with the largest broadside first.", sol: "SELECT shipName, guns / 2 AS [Guns per side] FROM Ship WHERE guns > 70 ORDER BY guns DESC, shipName ASC;", ordered: true, headings: true, hint: "A computed value with an alias: guns / 2 AS [Guns per side]. Sort by guns DESC, then shipName.", design: ["shipName, Guns per side = guns / 2", "Ship", "guns > 70", "", "guns DESC, shipName ASC"] },
    { t: "7 · Muster by squadron", brief: "Display each squadronName and the number of cadets in it, headed <b>[Cadets]</b>. Show the biggest squadron first, and break ties alphabetically by squadronName.", sol: "SELECT squadronName, COUNT(*) AS [Cadets] FROM Squadron, Cadet WHERE Squadron.squadronNo = Cadet.squadronNo GROUP BY squadronName ORDER BY COUNT(*) DESC, squadronName ASC;", ordered: true, headings: true, hint: "Join, GROUP BY squadronName, then ORDER BY COUNT(*) DESC. GROUP BY must come before ORDER BY.", design: ["squadronName, Cadets = COUNT(*)", "Squadron, Cadet", "", "squadronName", "COUNT(*) DESC, squadronName ASC"] },
    { t: "8 · Hours by wing", brief: "Display each wing and the average flying hours of its cadets, rounded to 1 decimal place and headed <b>[Average hours]</b>.", sol: "SELECT wing, ROUND(AVG(flyingHours), 1) AS [Average hours] FROM Squadron, Cadet WHERE Squadron.squadronNo = Cadet.squadronNo GROUP BY wing;", headings: true, hint: "ROUND(AVG(flyingHours), 1), grouped by wing.", design: ["wing, Average hours = ROUND(AVG(flyingHours),1)", "Squadron, Cadet", "", "wing", ""] },
    { t: "9 · Victualling: the sum of a calculation", brief: "Each cadet eats 3 meals a night aboard. For each shipName, display the total number of meals needed for all its postings, headed <b>[Meals needed]</b>, most first.", sol: "SELECT shipName, SUM(nights * 3) AS [Meals needed] FROM Ship, Posting WHERE Ship.shipCode = Posting.shipCode GROUP BY shipName ORDER BY SUM(nights * 3) DESC, shipName ASC;", ordered: true, headings: true, hint: "You can SUM a calculation: SUM(nights * 3). In 2025 many candidates could do the calculation or the SUM, but not both together. Break ties by shipName.", design: ["shipName, Meals needed = SUM(nights * 3)", "Ship, Posting", "", "shipName", "SUM(nights * 3) DESC, shipName ASC"] },
    { t: "10 · Above average (two queries)", brief: "Display the firstname, surname and flyingHours of every cadet with <b>more</b> flying hours than the average for all cadets. An aggregate can't go in WHERE, so first save a query that finds the average, then use it.", sol: "CREATE VIEW [Find Average] AS SELECT AVG(flyingHours) AS [Average Hours] FROM Cadet;\nSELECT firstname, surname, flyingHours FROM Cadet, [Find Average] WHERE flyingHours > [Average Hours];", hint: "Query 1: CREATE VIEW [Find Average] AS SELECT AVG(flyingHours) AS [Average Hours] FROM Cadet;  Query 2 uses [Find Average] as if it were a table. (A saved query in Access works the same way.)", design: ["Q1: Average Hours = AVG(flyingHours) · Q2: firstname, surname, flyingHours", "Q1: Cadet · Q2: Cadet, [Find Average]", "Q2: flyingHours > Average Hours", "", ""] },
    { t: "11 · UPDATE: wings awarded", brief: "Freya Henderson (C108) has completed a gliding course. Set her <b>glidingWings</b> to TRUE and add <b>5</b> to her flying hours.", sol: `UPDATE Cadet SET glidingWings = TRUE, flyingHours = flyingHours + 5 WHERE cadetID = "C108";`, check: "SELECT * FROM Cadet ORDER BY cadetID;", hint: "SET glidingWings = TRUE, flyingHours = flyingHours + 5 WHERE cadetID = \"C108\". Forget the WHERE and every cadet gets wings!" },
    { t: "12 · INSERT: a new posting", brief: "Post Zara Ahmed (C110) to HMS Redstone (RED) from <b>2026-10-01</b> for <b>5</b> nights as <b>Signals</b>, reporting at <b>08:30</b> (HMS Redstone's usual time).", sol: `INSERT INTO Posting (cadetID, shipCode, startDate, nights, role, reportTime) VALUES ("C110", "RED", "2026-10-01", 5, "Signals", "08:30");`, check: "SELECT * FROM Posting ORDER BY cadetID, shipCode;", hint: "INSERT INTO Posting (fields…) VALUES (values…), with the values in the same order as the fields. Every field has a presence check, so include all six." },
    { t: "13 · DELETE: voyage cancelled", brief: "HMS Cobblestone's voyage is cancelled. Delete every posting to ship <b>COB</b>.", sol: `DELETE FROM Posting WHERE shipCode = "COB";`, check: "SELECT * FROM Posting ORDER BY cadetID, shipCode;", hint: "DELETE FROM Posting WHERE … (and check with a SELECT first)." },
    { t: "14 · Fix the faulty query", brief: "This query should list each cadet's firstname with the shipName they're posted to (13 rows). Instead it returns 156 rows. Find and fix the error.", start: "SELECT firstname, shipName\nFROM Cadet, Posting, Ship\nWHERE Posting.shipCode = Ship.shipCode;", sol: "SELECT firstname, shipName FROM Cadet, Posting, Ship WHERE Cadet.cadetID = Posting.cadetID AND Posting.shipCode = Ship.shipCode;", hint: "Three tables need two joins. Which link is missing? Without it, every cadet is paired with every posting: 12 × 13 = 156." },
    { t: "15 · Early birds (a Time field)", brief: "Display firstname, shipName and reportTime for every posting whose cadets report <b>before 09:00</b>, earliest time first, then by firstname A–Z.", sol: `SELECT firstname, shipName, reportTime FROM Cadet, Posting, Ship WHERE Cadet.cadetID = Posting.cadetID AND Posting.shipCode = Ship.shipCode AND reportTime < "09:00" ORDER BY reportTime ASC, firstname ASC;`, ordered: true, hint: "Times are stored as HH:MM, so reportTime < \"09:00\" works. Three tables need two joins.", design: ["firstname, shipName, reportTime", "Cadet, Posting, Ship", 'reportTime < "09:00"', "", "reportTime ASC, firstname ASC"] },
    { t: "Free play", brief: "No mission: explore the database. Changes persist until you press <b>Reset data</b>.", free: true },
  ];

  function friendly(msg) {
    let m;
    if ((m = /no such column: (.+)/.exec(msg))) return `Unknown field "${m[1]}". Check the spelling, and that its table is listed in FROM.`;
    if ((m = /ambiguous column name: (.+)/.exec(msg))) return `"${m[1]}" is in more than one table. Put the table name in front, e.g. Cadet.${m[1].split(".").pop()}.`;
    if (/misuse of aggregate/.test(msg)) return "An aggregate function (COUNT, SUM, AVG, MIN, MAX) can't be used in a WHERE clause. Save a query that works out the value, then use it in a second query.";
    if ((m = /no such table: (.+)/.exec(msg))) return `There's no table called "${m[1]}". The tables are Squadron, Cadet, Ship and Posting.`;
    if ((m = /near "(.+)": syntax error/.exec(msg))) return `Syntax error near "${m[1]}". Check commas, quotes and the order of the clauses (SELECT, FROM, WHERE, GROUP BY, ORDER BY).`;
    if (/incomplete input/.test(msg)) return "The query stops too early. Is a clause, bracket or closing quote missing?";
    if (/UNIQUE constraint failed/.test(msg)) return "That primary key value already exists. Each key must be unique.";
    return msg;
  }
  function lint(sql) {
    const out = [];
    const s = sql.replace(/'[^']*'|"[^"]*"/g, "''");
    const sel = /select\s+([\s\S]*?)\s+from\s/i.exec(s);
    if (sel && !/group\s+by/i.test(s)) {
      const items = sel[1].split(/,(?![^(]*\))/).map((x) => x.trim());
      const agg = items.filter((x) => /\b(count|sum|avg|min|max)\s*\(/i.test(x));
      const plain = items.filter((x) => !/\b(count|sum|avg|min|max)\s*\(/i.test(x) && !/^\[.*\]$/.test(x) && !/^\d/.test(x));
      if (agg.length && plain.length) out.push("⚠ This mixes an aggregate with a plain field and has no GROUP BY. SQLite runs it, but it's an error at Higher (and in Access). Add GROUP BY, or remove the plain field.");
    }
    if (/order\s+by[\s\S]*group\s+by/i.test(s)) out.push("⚠ GROUP BY must come before ORDER BY.");
    if (/\b(update|delete)\b/i.test(s) && !/\bwhere\b/i.test(s)) out.push("⚠ No WHERE clause: this changes every row in the table.");
    return out;
  }
  function render(res) {
    if (!res) return el("p", { class: "hint" }, "Done. No rows returned (that's normal for UPDATE, INSERT and DELETE).");
    const t = el("table", { class: "sql-result" });
    t.innerHTML = `<thead><tr>${res.columns.map((c) => `<th>${HC.esc(c)}</th>`).join("")}</tr></thead><tbody>${res.values.map((r) => `<tr>${r.map((v) => `<td${typeof v === "number" ? ' class="num"' : ""}>${v === null ? "<i>null</i>" : HC.esc(v)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    return el("div", null, el("p", { class: "hint" }, `${res.values.length} row${res.values.length === 1 ? "" : "s"}`), el("div", { class: "table-wrap sql-out" }, t));
  }
  const norm = (v) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v === null ? null : String(v).trim());
  function same(a, b, ordered) {
    if (!a && b) return { ok: false, why: "Your query returned no rows at all. Check the WHERE clause (did you use = with a wildcard? Wildcards need LIKE)." };
    if (a && !b) return { ok: false, why: "This task doesn't need a table of results." };
    if (!a && !b) return { ok: true };
    if (a.columns.length !== b.columns.length) return { ok: false, why: `Your result has ${a.columns.length} column${a.columns.length === 1 ? "" : "s"}; the expected result has ${b.columns.length}.` };
    if (a.values.length !== b.values.length) return { ok: false, why: `Your result has ${a.values.length} row${a.values.length === 1 ? "" : "s"}; the expected result has ${b.values.length}.` };
    const A = a.values.map((r) => JSON.stringify(r.map(norm))), B = b.values.map((r) => JSON.stringify(r.map(norm)));
    if (!ordered) { A.sort(); B.sort(); }
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) {
      const sa = A.slice().sort(), sb = B.slice().sort();
      if (ordered && JSON.stringify(sa) === JSON.stringify(sb)) return { ok: false, why: "The right rows, but in the wrong order. Check your ORDER BY." };
      return { ok: false, why: `Row ${i + 1} differs from what was expected.` };
    }
    return { ok: true };
  }

  function playground(box) {
    const hint = box.querySelector(".hint");
    const fail = (why) => {
      hint.innerHTML = `The SQL engine couldn't be loaded (${HC.esc(why)}). Every query on this page is still shown in full above. `;
      const retry = el("button", { class: "btn small", type: "button" }, "↺ Try again");
      retry.addEventListener("click", () => { retry.remove(); start(); });
      hint.append(retry);
    };
    function start() {
      hint.textContent = "Loading the database engine…";
      const go = () => {
        // fetch the wasm ourselves so a network failure is catchable, and give up after 20 s
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timed out")), 20000));
        const load = fetch("vendor/sql-wasm.wasm").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("HTTP " + r.status))))
          .then((bin) => window.initSqlJs({ wasmBinary: bin }));
        Promise.race([load, timeout]).then((SQL) => build(box, SQL)).catch((e) => fail(e.message));
      };
      if (window.initSqlJs) return go();
      const sc = document.createElement("script");
      sc.src = "vendor/sql-wasm.js";
      sc.onerror = () => { sc.remove(); fail("script not found"); };
      sc.onload = go;
      document.head.append(sc);
    }
    start();
  }
  function build(box, SQL) {
    const fresh = () => { const d = new SQL.Database(); d.exec(SEED); return d; };
    let db = fresh();
    box.querySelector(".hint").remove();
    const ns = box.querySelector("noscript"); if (ns) ns.remove();
    const missionSel = el("select", { "aria-label": "Mission" }, ...MISSIONS.map((m, i) => el("option", { value: i }, m.t)));
    const brief = el("div", { class: "callout model", style: "margin:8px 0" });
    const ta = el("textarea", { class: "sql-editor", spellcheck: "false", "aria-label": "SQL editor", rows: 6 });
    const run = el("button", { class: "btn primary", type: "button" }, "▶ Run");
    const hintB = el("button", { class: "btn small", type: "button" }, "💡 Hint");
    const solB = el("button", { class: "btn small", type: "button" }, "📜 Show solution");
    const resetB = el("button", { class: "btn small danger", type: "button" }, "↺ Reset free-play data");
    const msg = el("div", { "aria-live": "polite", class: "sql-msg" });
    const out = el("div", { class: "sql-out-wrap" });
    const schema = el("details", { class: "sql-schema" }, el("summary", null, "🗂 Tables and fields (select a table to view its rows)"));
    const sch = el("div", { class: "btn-row" });
    [["Squadron", "squadronNo, squadronName, wing, town"], ["Cadet", "cadetID, firstname, surname, rank, dateOfBirth, squadronNo*, flyingHours, glidingWings"], ["Ship", "shipCode, shipName, rate, guns, launched, homePort"], ["Posting", "cadetID*, shipCode*, startDate, nights, role, reportTime"]].forEach(([n, f]) => {
      const b = el("button", { class: "btn small", type: "button", title: f }, n);
      // show the table without touching the pupil's own query
      b.addEventListener("click", () => {
        msg.innerHTML = ""; out.innerHTML = "";
        const isFree = MISSIONS[+missionSel.value].free;
        const d = isFree ? db : fresh();
        out.append(el("p", { class: "hint" }, isFree ? `${n}, as it is now in free play:` : `${n}, with its original data (each mission runs on a fresh copy of the database):`), render(lastResult(d, `SELECT * FROM ${n};`)));
      });
      sch.append(el("div", { class: "sql-tbl" }, b, el("code", null, f)));
    });
    schema.append(sch);
    box.append(el("div", { class: "btn-row" }, el("label", null, "Mission ", missionSel)), brief, schema, ta, el("div", { class: "btn-row" }, run, hintB, solB, resetB, el("span", { class: "hint", style: "margin:0" }, "Ctrl+Enter runs")), msg, out);
    const done = new Set();
    try { (JSON.parse(localStorage.getItem("hc-sql-done") || "[]")).forEach((x) => done.add(x)); } catch (e) { /* ignore */ }
    function setMission() {
      const m = MISSIONS[+missionSel.value];
      brief.innerHTML = `<div class="callout-title">${m.free ? "🧭" : done.has(+missionSel.value) ? "✔" : "🎯"} ${m.t}</div><p>${m.brief}</p>`;
      ta.value = m.start || (m.free ? "SELECT * FROM Cadet;" : "");
      msg.innerHTML = ""; out.innerHTML = "";
      hintB.hidden = solB.hidden = !!m.free;
      resetB.hidden = !m.free;
    }
    function lastResult(d, sql) {
      const r = d.exec(sql);
      return r.length ? r[r.length - 1] : null;
    }
    function exec(free) {
      const m = MISSIONS[+missionSel.value];
      const sql = ta.value.trim();
      msg.innerHTML = ""; out.innerHTML = "";
      if (!sql) { msg.innerHTML = "<p class='hint'>Type a query first.</p>"; return; }
      const warns = lint(sql);
      let res;
      try {
        if (m.free || free === true) {
          res = lastResult(db, sql);
          out.append(render(res));
        } else if (m.check) {
          const d1 = fresh(); d1.exec(sql); res = lastResult(d1, m.check);
          const d2 = fresh(); d2.exec(m.sol); const exp = lastResult(d2, m.check);
          const r = same(res, exp, true);
          out.append(el("p", { class: "hint" }, "After your statement, the table now holds:"), render(res));
          grade(r, m);
        } else {
          const d1 = fresh(); res = lastResult(d1, sql);
          const d2 = fresh(); const exp = lastResult(d2, m.sol);
          out.append(render(res));
          const r = same(res, exp, !!m.ordered);
          if (r.ok && m.headings && res) {
            const want = exp.columns.map((c) => c.toLowerCase()), got = res.columns.map((c) => c.toLowerCase().replace(/^['"]|['"]$/g, ""));
            if (JSON.stringify(want) !== JSON.stringify(got)) { r.ok = false; r.why = `The values are right, but the headings should be: ${exp.columns.join(", ")}. Use AS [heading].`; }
          }
          grade(r, m);
        }
      } catch (e) {
        msg.innerHTML = `<p class="bad">✘ ${HC.esc(friendly(e.message))}</p>`;
      }
      if (warns.length) msg.innerHTML += warns.map((w) => `<p class="sql-warn">${HC.esc(w)}</p>`).join("");
    }
    function grade(r, m) {
      if (r.ok) {
        const i = +missionSel.value;
        done.add(i);
        try { localStorage.setItem("hc-sql-done", JSON.stringify([...done])); } catch (e) { /* ignore */ }
        msg.innerHTML = `<p class="ok">✔ Mission accomplished! The output matches exactly.</p>` + (m.design ? designTable(m.design) : "");
        brief.querySelector(".callout-title").textContent = "✔ " + m.t;
      } else msg.innerHTML = `<p class="bad">✘ Not quite. ${HC.esc(r.why)}</p>`;
    }
    function designTable(d) {
      const H = ["Field(s) and calculation(s)", "Table(s) and query", "Search criteria", "Grouping", "Sort order"];
      return `<details><summary>See this query written as an SQA design table</summary><div class="table-wrap"><table>${H.map((h, k) => `<tr><th scope="row">${h}</th><td>${HC.esc(d[k])}</td></tr>`).join("")}</table></div></details>`;
    }
    run.addEventListener("click", exec);
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); exec(); } });
    hintB.addEventListener("click", () => { msg.innerHTML = `<p>💡 ${HC.esc(MISSIONS[+missionSel.value].hint)}</p>`; });
    solB.addEventListener("click", () => { const m = MISSIONS[+missionSel.value]; ta.value = m.sol.replace(/ (FROM|WHERE|GROUP BY|ORDER BY|SET|VALUES|AND) /g, "\n$1 "); });
    resetB.addEventListener("click", () => { db = fresh(); msg.innerHTML = "<p class='ok'>Database reset to its original data.</p>"; });
    missionSel.addEventListener("change", setMission);
    setMission();
  }

  function init() {
    const map = { "w-eod": eod, "w-groupby": groupby, "w-sql": playground };
    for (const [id, fn] of Object.entries(map)) {
      const box = document.getElementById(id);
      if (box) try { fn(box); } catch (e) { console.error(id, e); box.append(el("p", { class: "bad" }, "This interactive failed to load.")); }
    }
  }
  window.HC_DB = { SEED, MISSIONS, lint, same };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
