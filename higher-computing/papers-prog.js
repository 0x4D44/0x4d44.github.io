/* Past-paper practice: Programming (data structures, algorithms and code). Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HCP_BANK = window.HCP_BANK || {});
  const R = String.raw;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pre = (s) => "<pre>" + esc(s) + "</pre>";
  /* a few shared pattern fragments (normalised answers are lower case with whitespace collapsed to single spaces) */
  const INPUT = R`(receive|input\s*\(|readline|prompt\s*\(|scanner|read\s*\(|cin\s*>>)`;
  const OUT = R`(send|print|console\.log|display|alert|write|return)`;
  const FUNC2 = R`((function|def|procedure|sub)\s+\w+\s*\([^)]*,[^)]*\)|\w+\s*=\s*(function\s*)?\(\s*\w+\s*,\s*\w+\s*\)\s*(=>|\{)|lambda\s+\w+\s*,\s*\w+)`;
  /* prog-04: the range 0 to 150, as the INVALID test (loop condition) and as the VALID test (flag / until / break) */
  const LT0 = R`(<\s*0|<=\s*-1)`, GT150 = R`(>\s*150|>=\s*151)`;
  const INV = R`(\w+\s*${LT0}\)?\s*(or|\|\|)\s*\(?\s*\w+\s*${GT150}|\w+\s*${GT150}\)?\s*(or|\|\|)\s*\(?\s*\w+\s*${LT0})`;
  const VAL = R`(\w+\s*>=\s*0\)?\s*(and|&&)\s*\(?\s*\w+\s*<=\s*150|\w+\s*<=\s*150\)?\s*(and|&&)\s*\(?\s*\w+\s*>=\s*0|0\s*<=\s*\w+\s*<=\s*150|\w+\s*>\s*-1\s*(and|&&)\s*\w+\s*<\s*151)`;
  /* prog-10: "the item at this index equals the target" */
  const CMP10 = R`(\w+\s*\[\s*\w+\s*\]\s*={1,3}\s*\w+|\w+\s*={1,3}\s*\w+\s*\[\s*\w+\s*\]|\bif\s+\w+\s+in\s+\w+|\bif\s*\(?\s*\w+\s*={1,3}\s*\w+)`;
  const FIRST3 = R`(\[\s*0?\s*:\s*3\s*\]|(left|substring|substr|slice|mid)\s*\([^)]*\))`;
  /* prog-09: book.genre equals the parameter (not a literal, not "not equal"); or a one-line counting comprehension */
  const CMP9 = R`(\.genre\s*(\.\w+\(\))?\s*={1,3}\s*(?!["'])\w+|\w+\s*={1,3}\s*\w+\.genre|\.genre\s*\)?\s*\.?equals|\[\s*["']genre["']\s*\]\s*={1,3}\s*(?!["'])\w+)`;
  const COMPR9 = R`((len|sum)\s*\(\s*[\[(]?[^]{0,50}\bfor\s+\w+\s+in\s+\w+[^]{0,30}\bif\b[^]{0,40}\.genre\s*={1,3}|filter\s*\([^]{0,60}\.genre\s*={1,3}[^]{0,40}\)\s*\.length)`;
  const FLAG = R`\w*(valid|ok|good|correct|accept\w*|done|finished)\w*`;
  const LOOP04 = R`(while\s*\(?\s*(${INV}|(not|!)\s*\(?\s*\(?\s*${VAL}|(not|!)\s*\(?\s*\w+\s*in\s*range|${FLAG}\s*(=|==|===|is)\s*(false|0|no)\b|(not|!)\s*${FLAG}\b|\w+\s*==?\s*false)|until\s*\(?\s*(${VAL}|${FLAG}\s*(=|==|===|is)?\s*(true|1|yes)?\b)|while\s*\(?\s*(true|1)\b[^]{0,260}(break|return))`;
  B.prog = {
    intro:
      "<p>Programming is the implementation side of Software design and development, and the biggest block of marks in the real paper (SDD fills about 41 to 45 of the 55 marks in Section 1, and most of that is reading, tracing, completing and writing code). Code appears in SQA reference language; you may answer in Python, JavaScript or reference language, and the marks are for the logic, not the syntax. The 2025 course report's commonest slips are targeted here: describing what the lines do instead of what they achieve <em>in the context</em>; unnecessary parameters; two near-identical sub-programs instead of one with a parameter called twice; describing the code to change when the question asked what code to <em>add</em>; and <code>=</code> against <code>==</code> or <code>&gt;</code> against <code>&gt;=</code> in a condition. Work every trace by hand before you check it.</p>",
    questions: [
      /* ---------------------------------------------------------------- 01 */
      {
        id: "prog-01",
        style: "Short recall · data types and structures",
        stem:
          "<p>An island ferry company stores data about each of its sailings in a booking program.</p>",
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: "Match each item of data to the most suitable data type. [4]",
            pairs: [
              ["Number of passengers booked on a sailing, e.g. 214", "INTEGER"],
              ["Fare for one adult, e.g. 12.50", "REAL"],
              ["Whether the car deck is full", "BOOLEAN"],
              ["Vehicle registration, e.g. SK21 ABC", "STRING"],
            ],
          },
          {
            label: "(b)", type: "mcq", marks: 1,
            q: "Each sailing has a route name (text), a departure time (text) and a number of passengers (integer). Which data structure groups values of different types under one name? [1]",
            opts: ["A 1-D array", "A record", "A parallel array", "A Boolean"],
            a: 1,
            why: "A record holds several fields of different types under one name. A 1-D array can only hold values of one type, and parallel arrays are separate arrays that must be kept in step.",
          },
          {
            label: "(c)", type: "multi", marks: 2,
            q: "Which TWO statements about a 1-D array are true? [2]",
            opts: [
              "Every element has the same data type",
              "Elements are reached using an index number",
              "An array can hold a mixture of STRING and INTEGER values",
              "In SQA reference language the first element is at index 1",
              "Each element is a field with its own name",
            ],
            a: [0, 1],
            why: "A 1-D array holds values of one type, found by index. Mixed types need a record, the first index is 0, and named fields belong to records.",
          },
        ],
      },
      /* ---------------------------------------------------------------- 02 */
      {
        id: "prog-02",
        style: "Data structures · parallel arrays v records",
        stem:
          "<p>A school library stores each book's title, author and number of loans in three parallel 1-D arrays called <code>titles</code>, <code>authors</code> and <code>loans</code>. The library holds ten books, stored at indexes 0 to 9.</p>",
        parts: [
          {
            label: "(a)", type: "text", marks: 2,
            q: "Describe one weakness of using parallel arrays to store this data. [2]",
            points: [
              { desc: "the arrays must be kept in step / the same index must refer to the same book", negOK: true, not: [R`(not|never|n't)\s+(\w+\s+)?(need|have|required|important|matter|problem)`, R`\b(have|has|does|do|is|are|can)\s+not\s+(\w+\s+)?(to\s+)?(be\s+)?(kept|in step)`], all: [R`(in step|lin(e|es|ed) up|out of step|out of line|same (index|position|subscript)|match(ed|es)? up|stay\w* (together|in step|aligned)|keep\w* (them )?(in step|together|aligned)|synchron)`, R`(arrays?|index\w*|indices|data|lists?|position|book|title|author|loans|them|they|each other)`], win: 90 },
              { desc: "e.g. sorting or deleting in one array only gives a book the wrong author or loans", negOK: true, not: [R`\b(is|are|does|do)\s+not\s+(\w+\s+)?(sorted|deleted|removed|changed|updated|inserted)`], all: [R`(sort\w*|delet\w*|remov\w*|insert\w*|forget\w*|update\w*|swap\w*|chang\w*)`, R`(wrong|mismatch\w*|incorrect|out of (step|line)|belong\w* to|mixed|muddl\w*|corrupt\w*|no longer (match|line|lines)|different (book|author)|matched with|(doesn't|does not|do not|don't|won't|will not|wouldn't|would not|stop\w*)\s+(\w+\s+)?(line|match|correspond|belong))`, R`(arrays?|index\w*|indices|title|author|loans|book|data|item|one of|others)`], win: 140 },
            ],
            sample: "The three arrays have to be kept in step by the programmer, so if one array is sorted or an item is deleted from only one of them, the same index stops matching and a title ends up with the wrong author or loans.",
            model: "<p>Any 2: (1) the arrays are separate and must be kept in step (the same index refers to the same book); (1) a change made to one array only (sorting, deleting, inserting) leaves the others out of line, so data about different books gets mixed up.</p>",
          },
          {
            label: "(b)", type: "code", marks: 3,
            q: "The library decides to use an array of records instead. Write the code to declare a record type for a book, then declare an array able to hold all the library's books. [3]",
            points: [
              { desc: "a record (or class/structure) with title and author as strings", all: [R`(record|class|struct)\s+\w+\s*(is|\{|:|\()`, R`(string|str)\s+(title|author)|(title|author)\s*(:|as)\s*(string|str)|this\.(title|author)|self\.(title|author)|(title|author)\s*=\s*["']{2}`], win: 220 },
              { desc: "loans held as an integer field", any: [R`(integer|int)\s+loans`, R`loans\s*(:|as)\s*(integer|int)`, R`this\.loans|self\.loans`, R`loans\s*=\s*0`, R`loans\s*,\s*\d`] },
              { desc: "an array (list) for 10 of the record type", any: [R`\*\s*10\b`, R`range\s*\(\s*10\s*\)`, R`\[\s*10\s*\]`, R`array\s*\(\s*10\s*\)`, R`\b10\s*(books|elements|records)`, R`array of \w+[^]{0,60}\b10\b`] },
            ],
            sample: 'RECORD Book IS {STRING title, STRING author, INTEGER loans}\nDECLARE books AS ARRAY OF Book INITIALLY [ Book("", "", 0) ] * 10',
            model: "<p>(1) Record type with fields title and author (STRING); (1) loans as INTEGER; (1) array of 10 elements of the record type. Python: a <code>class Book</code> with three fields and <code>books = [Book(\"\", \"\", 0) for _ in range(10)]</code>.</p>" + pre('RECORD Book IS {STRING title, STRING author, INTEGER loans}\nDECLARE books AS ARRAY OF Book INITIALLY [ Book("", "", 0) ] * 10'),
          },
        ],
      },
      /* ---------------------------------------------------------------- 03 */
      {
        id: "prog-03",
        style: "Trace · fixed and conditional loops",
        stem:
          "<p>A trainee is testing two pieces of code. Work through each by hand.</p><p><strong>Code A</strong></p>" +
          pre('SET total TO 0\nFOR i FROM 1 TO 6 DO\n   IF i MOD 2 = 0 THEN\n      SET total TO total + i * i\n   ELSE\n      SET total TO total - 1\n   END IF\nEND FOR\nSEND total TO DISPLAY') +
          "<p><strong>Code B</strong></p>" +
          pre('SET stock TO 100\nSET days TO 0\nWHILE stock > 20 DO\n   SET stock TO stock - 15\n   SET days TO days + 1\nEND WHILE'),
        parts: [
          { label: "(a)", type: "num", marks: 1, q: "State the value of total at the end of the 4th repetition (i = 4) of Code A. [1]", a: 18, tol: 0, why: "i=1: total = 0-1 = -1. i=2: -1+4 = 3. i=3: 3-1 = 2. i=4: 2+16 = 18." },
          { label: "(b)", type: "num", marks: 1, q: "State the value displayed by Code A. [1]", a: 53, tol: 0, why: "After i=4 total is 18. i=5: 18-1 = 17. i=6: 17+36 = 53." },
          { label: "(c)", type: "num", marks: 1, q: "How many times is the statement SET total TO total - 1 executed in Code A? [1]", a: 3, tol: 0, why: "It runs for the odd values of i: 1, 3 and 5, so 3 times." },
          { label: "(d)", type: "num", marks: 1, q: "State the final value of days in Code B. [1]", a: 6, tol: 0, why: "stock goes 100, 85, 70, 55, 40, 25, 10. It is above 20 for the first six values, so the loop body runs 6 times." },
          { label: "(e)", type: "num", marks: 1, q: "State the final value of stock in Code B. [1]", a: 10, tol: 0, why: "After six subtractions of 15 from 100: 100 - 90 = 10. The test stock > 20 is then false." },
        ],
      },
      /* ---------------------------------------------------------------- 04 */
      {
        id: "prog-04",
        style: "Write code · input validation",
        stem:
          "<p>A weather station program records the wind speed in miles per hour. A valid wind speed is a whole number from 0 to 150 inclusive.</p>",
        parts: [
          {
            label: "(a)", type: "code", marks: 4,
            q: "Write code that asks the user for a wind speed and keeps asking until a valid value is entered. Display a message each time an invalid value is rejected. [4]",
            points: [
              { desc: "the wind speed is read from the keyboard", any: [INPUT] },
              { desc: "a conditional loop that repeats while the value is INVALID (below 0 or above 150), or until it is valid", any: [LOOP04] },
              { desc: "both ends of the range tested correctly (below 0 OR above 150, or the valid range with AND)", any: [
                R`${INV}`,
                R`(if|elif|until|unless|not|!)\s*\(?\s*\(?\s*${VAL}`] },
              { desc: "an error message displayed inside the loop", all: [LOOP04, R`(send|print|console\.log|alert|display|write)\s*\(?\s*f?["']`], win: 260 },
              { desc: "the user is asked again inside the loop (re-input)", any: [R`${LOOP04}[^]{0,220}${INPUT}`, R`\b(repeat|do)\b[^]{0,160}${INPUT}[^]{0,260}\b(until|while)\b`] },
            ],
            sample: 'RECEIVE speed FROM (INTEGER) KEYBOARD\nWHILE speed < 0 OR speed > 150 DO\n   SEND "Invalid, enter 0 to 150" TO DISPLAY\n   RECEIVE speed FROM (INTEGER) KEYBOARD\nEND WHILE',
            model: "<p>(1) value read before the loop; (1) conditional loop (WHILE, or REPEAT ... UNTIL); (1) condition correct at both ends, with OR (&lt; 0 or &gt; 150), or the equivalent AND with UNTIL; (1) message inside the loop and the value asked for again inside the loop. A <code>while True</code> loop with a <code>break</code> when the value is in range is accepted.</p>" + pre('RECEIVE speed FROM (INTEGER) KEYBOARD\nWHILE speed < 0 OR speed > 150 DO\n   SEND "Invalid, enter 0 to 150" TO DISPLAY\n   RECEIVE speed FROM (INTEGER) KEYBOARD\nEND WHILE'),
          },
          {
            label: "(b)", type: "text", marks: 2,
            q: "Explain why a conditional loop, rather than a fixed loop, is used here. [2]",
            points: [
              { desc: "the number of repeats is not known in advance (depends on how many invalid entries)", negOK: true, not: [R`\b(we|you|it|they)\s+know\s+(how|the)`, R`(is|are)\s+(already\s+)?known`, R`\bnot\s+(\w+\s+)?(unknown|unpredictable)`], any: [
                R`(number of|how many|amount of)\s+(\w+\s+){0,5}(times|repeat\w*|attempts|entries|iterations|goes|loops?|wrong\w*|tries|inputs?)\b[^]{0,50}(unknown|not known|isn't known|unpredictable|vary|varies|varied|depends|different|can't be (known|predicted)|cannot be (known|predicted))`,
                R`(unknown|unpredictable|not known|don'?t know|do not know|no way of knowing|can't (tell|predict)|cannot (tell|predict))[^]{0,40}(number of|how many|how often|how long|how much)`,
                R`(depends?|vary|varies)\s+(on\s+)?(how|the user|the number|whether|what)`,
                R`any number of (times|attempts|goes|tries|repeats|loops)`,
                R`(once|one go|first (time|go|try|attempt)|one attempt)\s+(\w+\s+){0,3}(or|and)\s+(\w+\s+){0,3}(many|several|more|lots|multiple|repeated)`] },
              { desc: "it keeps repeating until a valid value is entered", negOK: true, not: [R`\b(has|have|do|does|will|can)\s+not\s+(to\s+)?(keep|repeat|stop|continue|go)`, R`\b(is|are)\s+not\s+(\w+\s+)?(entered|valid|correct)`], any: [R`(until|as long as|while|keeps? (asking|repeating|going))[^]{0,70}(valid|correct|acceptable|within|range|right)`, R`(stops?|ends?|exits?)[^]{0,40}(valid|correct|acceptable|within|range|right)`] },
            ],
            sample: "The number of times the user will type an invalid speed is unknown in advance, so the loop has to keep repeating until a valid value is entered. A fixed loop would repeat a set number of times whatever was typed.",
            model: "<p>(1) The number of repetitions is not known beforehand (the user might be right first time or wrong several times); (1) a conditional loop repeats until the condition is met, i.e. until a valid value is entered, whereas a fixed loop runs a set number of times.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 05 */
      {
        id: "prog-05",
        style: "Write code · file handling, running total",
        stem:
          "<p>A weather station stores one day's rainfall (in mm) on each line of a text file called <code>rainfall.txt</code>. The file holds seven lines, one for each day of the week:</p>" +
          "<table><tr><th>Line</th><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td></tr><tr><th>Text</th><td>4.5</td><td>0</td><td>12</td><td>7.5</td><td>3</td><td>0</td><td>10.5</td></tr></table>",
        parts: [
          { label: "(a)", type: "num", marks: 1, q: "State the total rainfall for the week, in mm. [1]", a: 37.5, tol: 0, unit: "mm", why: "4.5 + 0 + 12 + 7.5 + 3 + 0 + 10.5 = 37.5 mm." },
          {
            label: "(b)", type: "code", marks: 5,
            q: "Write code to read the seven values from the file, keep a running total, and display the average daily rainfall. [5]",
            points: [
              { desc: "the file is opened for reading", any: [R`open\s*\(?\s*["']rainfall\.txt`, R`(fopen|readfile|scanner|filereader)[^]{0,40}rainfall`] },
              { desc: "a loop reads each line of the file", all: [R`(for|while|repeat)\b[^]{0,60}(\b[67]\b|line|file|eof|readline|range|len)`, R`(receive|readline|readlines|for\s+\w+\s+in\s+\w+|\.read|nextline|getline)`], win: 200 },
              { desc: "each line is converted to a number before it is used", any: [R`(float|real|parsefloat|number|double)\s*\(`] },
              { desc: "the value is added to a running total (total starts at zero)", any: [R`(\w+)\s*(=|to)\s*\1\s*\+\s*[\w(]`, R`\+=`] },
              { desc: "average = total divided by the number of days, and displayed", all: [R`/\s*(7|\w*len|count|days|n\b)`, R`(send|print|console\.log|display|alert)`], win: 200 },
              { desc: "the file is closed", any: [R`close`] },
            ],
            sample: 'DECLARE total INITIALLY 0.0\nOPEN "rainfall.txt"\nFOR day FROM 1 TO 7 DO\n   RECEIVE line FROM "rainfall.txt"\n   SET total TO total + REAL(line)\nEND FOR\nCLOSE "rainfall.txt"\nSET average TO total / 7\nSEND average TO DISPLAY',
            model: "<p>(1) open the file; (1) loop through the seven lines, reading a line each time; (1) convert the text to a number; (1) running total, initialised to 0 and added to inside the loop; (1) average = total / 7 displayed. Closing the file is also looked for. Python: <code>for line in file: total = total + float(line)</code> is full marks.</p>" + pre('DECLARE total INITIALLY 0.0\nOPEN "rainfall.txt"\nFOR day FROM 1 TO 7 DO\n   RECEIVE line FROM "rainfall.txt"\n   SET total TO total + REAL(line)\nEND FOR\nCLOSE "rainfall.txt"\nSET average TO total / 7\nSEND average TO DISPLAY'),
          },
          {
            label: "(c)", type: "text", marks: 2,
            q: "Explain why each line read from the file has to be converted before it is added to the total. [2]",
            points: [
              { desc: "everything read from a file arrives as text (a string)", negOK: true, any: [R`(\b(is|are|as|comes?|came|arrives?|arrived|returned|read|stored|treated|held|saved|be)\b|'s)\s+(in\s+)?(as\s+)?(an?\s+)?(string|strings|text|characters)\b`, R`(string|strings|text|characters)\s*,?\s+(not|rather than|instead of)\s+(a\s+|any\s+)?(number|numbers|real|float|integer|numeric)`, R`(gives?|gave|get|gets|returns?|provides?|reads?)\s+(you\s+|us\s+|back\s+)?(it\s+)?(as\s+)?(an?\s+)?(text|strings?|characters)\b`, R`(\bis|\bare|'s|\bwas)\s+not\s+(a\s+)?(number|numeric|real)`] },
              { desc: "adding text joins it together instead of adding the numbers (or gives an error)", negOK: true, not: [R`\b(would|will|does|do|can|is|are)\s+not\s+(be\s+)?(\w+\s+)?(joined|concatenat\w*|added|wrong|incorrect|stuck|glued|appended)`], any: [R`(join\w*|concatenat\w*|stick\w*|glue\w*|append\w*|chain\w*|put\w* together)[^]{0,40}(instead of|rather than|not add\w*|not sum\w*|together|on the end|end to end|side by side|as (text|strings?)|\bto each other)`, R`(concatenat\w*|join\w*|stick\w*|glue\w*)\s+(\w+\s+){0,4}(and|but|so)\s+(does\s+)?not\s+(add|sum|calculat\w*|work)`, R`(instead|rather) than (add\w*|sum\w*|calculat\w*|doing (the )?(maths?|arithmetic))`, R`(would|will|could|may|might|can)\s+(\w+\s+){0,2}(error|crash\w*|fail\w*)|(type\s?error|an error)|(cannot|can't|can not|won't|wouldn't)\s+(\w+\s+){0,3}(add\w*|\+|sum|calculat\w*|arithmetic|maths?)`, R`(total|answer|result|sum)\s+(would|will|be)\s+(be\s+)?(wrong|incorrect)`] },
            ],
            sample: "A value read from a file arrives as a string. If it was added without converting it, the text would be joined together (4.5 and 0 would make 4.50) rather than the numbers being added, so the total would be wrong.",
            model: "<p>(1) Data read from a file is a string (text); (1) adding strings concatenates them instead of doing arithmetic, so the total would be wrong or the program would crash. Converting with float()/REAL() gives a number first.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 06 */
      {
        id: "prog-06",
        style: "Read code · sub-programs and parameters",
        stem:
          "<p>A shop uses this function to work out a sale price.</p>" +
          pre('FUNCTION discount(REAL price, INTEGER percent) RETURNS REAL\n   RETURN price - price * percent / 100\nEND FUNCTION\n\nSET cost TO 80.0\nSET sale TO discount(cost, 15)\nSEND sale TO DISPLAY'),
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: "Match each part of the code to its description. [4]",
            pairs: [
              ["price and percent in the first line", "Formal parameters"],
              ["cost and 15 in the call", "Actual parameters"],
              ["The line beginning RETURN", "Passes the result back to the code that called the function"],
              ["The variable sale", "Receives the value returned by the function"],
            ],
          },
          { label: "(b)", type: "num", marks: 1, q: "State the value displayed. [1]", a: 68, tol: 0, why: "price * percent / 100 = 80 * 15 / 100 = 12, and 80 - 12 = 68." },
          {
            label: "(c)", type: "text", marks: 2,
            q: "The programmer made the percentage a parameter instead of writing 15 inside the function. Explain why this is good practice. [2]",
            points: [
              { desc: "the function can be called with different percentages / any rate", any: [R`(different|various|any|other|changed|several|another|varying)\s+(\w+\s+)?(percent\w*|rates?|discounts?|amounts?|values?|offers?|sales?)`, R`(vary|varies|varied|change|changes|changed)\s+(the\s+|its\s+|a\s+|each\s+)?(percent\w*|rate|discount)`, R`(percent\w*|discount)\s+(\w+\s+){0,3}(can|could|may)\s+(be\s+)?(chang\w*|differ\w*|vary|varied|set)`] },
              { desc: "one function is reused, with no near-identical copies to write", negOK: true, any: [R`(reus\w*|re-us\w*)\s+(the\s+|that\s+|same\s+|a\s+)?(\w+\s+)?(function|code|sub-?program|procedure)`, R`(function|code|sub-?program|procedure)\s+(\w+\s+){0,2}(can be|is|be)\s+(re-?us\w*|used (again|many times|more than once|for))`, R`(not|no|without|avoids?|instead of)\s+(\w+\s+){0,2}(duplicat\w*|repeat\w*|copies|copying)`, R`(one|same|single)\s+(function|sub-?program|procedure|code)`, R`(no need|don't need|do not need|not need|without)\s+(to\s+)?(\w+\s+){0,3}(write|writing|create|creating|make|making|copy|copies|duplicat\w*|rewrit\w*|repeat\w*)`, R`(near.)?identical (functions?|code|copies)`, R`(several|many|lots of|separate|multiple|another)\s+(\w+\s+)?(functions?|sub-?programs?|procedures?|copies|versions)`, R`(duplicat\w*|repeat\w*)[^]{0,15}code`] },
            ],
            sample: "With a percent parameter the same function can be called with different discounts, such as 10, 15 or 20. The code is reused, so there is no need to write several near identical functions.",
            model: "<p>(1) The function can be called with different discount values (10%, 15%, 20% ...); (1) one function is reused instead of writing several near-identical functions, which is shorter and easier to maintain. A 2025 course report point.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 07 */
      {
        id: "prog-07",
        style: "Read code · scope and good practice",
        stem:
          "<p>A quiz program keeps a running score.</p>" +
          pre('SET total TO 0\n\nPROCEDURE addScore(INTEGER points)\n   DECLARE bonus INITIALLY 5\n   SET total TO total + points + bonus\nEND PROCEDURE\n\naddScore(10)\naddScore(20)\nSEND total TO DISPLAY\nSEND bonus TO DISPLAY'),
        parts: [
          { label: "(a)", type: "num", marks: 1, q: "State the value displayed by the first SEND statement. [1]", a: 40, tol: 0, why: "First call: 0 + 10 + 5 = 15. Second call: 15 + 20 + 5 = 40." },
          {
            label: "(b)", type: "text", marks: 2,
            q: "The final line, SEND bonus TO DISPLAY, causes an error. Explain why. [2]",
            points: [
              { desc: "bonus is a local variable, declared inside the procedure", negOK: true, not: [R`(not|n't)\s+(a\s+)?local`], any: [R`\blocal(ly)?\b[^]{0,50}(procedure|sub-?program|addscore|inside|within|function)`, R`(procedure|sub-?program|addscore|inside|within|function)[^]{0,50}\blocal\b`, R`declared\s+(\w+\s+)?(inside|within|in)\s+(the\s+)?(procedure|sub-?program|addscore|function)`] },
              { desc: "so it cannot be seen / does not exist in the main program", negOK: true, any: [R`(out of scope|undefined|not defined|no longer exist\w*|doesn't exist|does not exist|only exists? (while|when|inside|in|within))`, R`(cannot|can't|isn't|not|never|unable)\s+(\w+\s+){0,3}(seen|used|accessed|accessible|visible|found|recogni[sz]ed|reached|referred)[^]{0,50}(main|outside|program|elsewhere|global|rest|after|other|where)`] },
            ],
            sample: "bonus is a local variable that is declared inside the addScore procedure, so it only exists while the procedure runs. In the main program it is out of scope, so using it there causes an error.",
            model: "<p>(1) bonus is declared inside the procedure, so it is a local variable; (1) a local variable exists only while the sub-program runs and is not visible (out of scope) in the main program, so the last line fails with an error.</p>",
          },
          {
            label: "(c)", type: "multi", marks: 3,
            q: "Which THREE statements about variable scope are true? [3]",
            opts: [
              "A local variable can only be used inside the sub-program where it is declared",
              "A global variable is declared in the main program and can be used anywhere",
              "Two sub-programs cannot each have a local variable with the same name",
              "A local variable keeps its value from one call of the sub-program to the next",
              "Passing parameters instead of using globals makes a sub-program easier to test and reuse",
              "A global variable is created afresh each time a sub-program is called",
            ],
            a: [0, 1, 4],
            why: "Locals are visible only in their own sub-program; globals are visible everywhere; parameters give a sub-program clear inputs and outputs, so it can be tested and reused. Two sub-programs may each have their own local of the same name, a local is created afresh on every call, and a global is created once.",
          },
          {
            label: "(d)", type: "text", marks: 2,
            q: "The programmer plans to rewrite addScore as a function that is passed the current total and returns the new total, instead of changing the global variable. Explain why this is better practice. [2]",
            points: [
              { desc: "a global can be changed by any line / any sub-program, or the function does not rely on a global, so errors are hard to trace", negOK: true, not: [R`\b(can|could)\s+not\s+(be\s+)?(\w+\s+)?(chang\w*|alter\w*|modif\w*|overwr\w*|affect\w*)`, R`\b(is|are)\s+not\s+(\w+\s+)?(hard|difficult)`], any: [
                R`(any|every|other|anywhere|everywhere|all)\s+(\w+\s+){0,3}(line|part|code|sub-?programs?|procedures?|functions?|where)[^]{0,60}(chang\w*|alter\w*|modif\w*|overwr\w*|affect\w*|interfer\w*)`,
                R`(chang\w*|alter\w*|modif\w*|overwr\w*|affect\w*|interfer\w*)[^]{0,50}(anywhere|everywhere|by any|from any|other (parts?|code|sub-?programs?|procedures?|functions?))`,
                R`(not|n't|without|no longer)\s+(\w+\s+){0,2}(rely|relies|depend\w*|use|using|need\w*|touch\w*|change|changing|alter\w*)[^]{0,20}global`,
                R`global[^]{0,60}(unexpected|side[- ]effects?|overwr\w*|accident\w*|hard to (trace|track|find|debug)|difficult to (trace|track|find|debug))`, R`(side[- ]effects?|unexpected|accident\w*)[^]{0,40}global`] },
              { desc: "inputs and outputs are clear, so the sub-program can be tested alone and reused", not: [R`\b(is|are|can|could|does|do|will)\s+not\s+(be\s+)?(\w+\s+)?(clear|tested|reused|reusable|independent|predictable)`], any: [R`(test\w*|reus\w*|re-us\w*|debug\w*|portable)[^]{0,40}(independent\w*|alone|separate\w*|own|elsewhere|other (programs?|projects?)|different programs?|easier|easy)`, R`(independent\w*|alone|separate\w*|easier|easy|can be|could be|to)[^]{0,40}(test\w*|reus\w*|re-us\w*|debug\w*)`, R`(self-contained|stand\w* alone|clear (inputs|data flow)|inputs and outputs|predictable)`] },
            ],
            sample: "A global variable can be changed by any line of the program, so a wrong value is hard to trace back. With a parameter and a returned value the function's inputs and outputs are clear, so it can be tested on its own and reused.",
            model: "<p>(1) A global can be changed from anywhere in the program, which makes errors hard to find; (1) with parameters and a returned value the sub-program has clear inputs and outputs, so it can be tested separately and reused in other programs.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 08 */
      {
        id: "prog-08",
        style: "Read code · find maximum position, in context",
        stem:
          "<p>A football league table is held in two parallel arrays. The data is shown below, and the code follows it.</p>" +
          "<table><tr><th>index</th><td>0</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr><tr><th>teams</th><td>Rovers</td><td>Hawks</td><td>United</td><td>Thistle</td><td>Athletic</td><td>City</td></tr><tr><th>goals</th><td>14</td><td>22</td><td>9</td><td>25</td><td>17</td><td>25</td></tr></table>" +
          pre('DECLARE maxPos INITIALLY 0\nFOR index FROM 1 TO 5 DO\n   IF goals[index] > goals[maxPos] THEN\n      SET maxPos TO index\n   END IF\nEND FOR\nSEND "Leader: " & teams[maxPos] TO DISPLAY'),
        parts: [
          {
            label: "(a)", type: "text", marks: 2,
            q: "Describe what this code achieves in the context of the league. [2]",
            points: [
              { desc: "finds the team with the highest number of goals scored", all: [R`\b(most|highest|top|maximum|largest|greatest|biggest|best)\b`, R`(goals|scored|scorer|scoring)`], win: 80 },
              { desc: "by finding its position (index), then displaying that team's name", any: [R`(display\w*|show\w*|print\w*|output\w*|sends?|gives?|tells?|says?|reports?)\s+(\w+\s+){0,4}(name|team|club|leader)`, R`(position|index|location)\s+(\w+\s+){0,3}(of|for)\s+(\w+\s+){0,2}(team|club|one|highest|top|leader|most|goals)`, R`(stor\w+|keeps?|remembers?|records?|saves?|finds?)\s+(\w+\s+){0,4}(position|index|location)`] },
            ],
            sample: "It finds the team that has scored the highest number of goals in the league. It works out the position of that team in the arrays and displays the name of that team.",
            model: "<p>(1) Finds the team with the most goals (the top scorer); (1) by storing the position of the highest goals value and using it to display that team's name. Answers that only say 'it loops and compares' earn nothing: refer to the context (2025 course report).</p>",
          },
          { label: "(b)", type: "num", marks: 1, q: "State the final value of maxPos. [1]", a: 3, tol: 0, why: "maxPos starts at 0. index 1: 22 > 14, so 1. index 2: 9 > 22 is false. index 3: 25 > 22, so 3. index 4: 17 > 25 false. index 5: 25 > 25 is false, so it stays 3 (Thistle)." },
          { label: "(c)", type: "num", marks: 1, q: "How many times is the statement SET maxPos TO index executed? [1]", a: 2, tol: 0, why: "Only at index 1 (22 > 14) and index 3 (25 > 22)." },
          { label: "(d)", type: "num", marks: 1, q: "The condition is changed from > to >=. State the new final value of maxPos. [1]", a: 5, tol: 0, why: "With >= the tie at index 5 (25 >= 25) now replaces maxPos, so it ends at 5 (City)." },
          {
            label: "(e)", type: "mcq", marks: 1,
            q: "The program is to be changed to display the team with the FEWEST goals. Which change is needed? [1]",
            opts: [
              "Change > to < in the IF condition (and keep the first element as the starting position)",
              "Change FROM 1 TO 5 to FROM 5 TO 1",
              "Set the starting position to 5 instead of 0",
              "Change goals[maxPos] to goals[0] in the condition",
            ],
            a: 0,
            why: "A minimum search is the maximum search with the comparison turned round: replace the stored position whenever a smaller value turns up, starting from the first element.",
          },
        ],
      },
      /* ---------------------------------------------------------------- 09 */
      {
        id: "prog-09",
        style: "Write code · count occurrences with an array of records",
        stem:
          "<p>A library stores its 8 books in an array of records called <code>books</code>.</p>" +
          pre('RECORD Book IS {STRING title, STRING genre}\nDECLARE books AS ARRAY OF Book INITIALLY [ Book("", "") ] * 8') +
          "<table><tr><th>index</th><td>0</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td></tr><tr><th>genre</th><td>Crime</td><td>Fantasy</td><td>Crime</td><td>History</td><td>Crime</td><td>Fantasy</td><td>Poetry</td><td>Crime</td></tr></table>",
        parts: [
          {
            label: "(a)", type: "code", marks: 5,
            q: "Write a function that is passed the array of books and a genre, and returns how many books are of that genre. [5]",
            points: [
              { desc: "a function with the array and the genre as parameters", any: [FUNC2] },
              { desc: "a loop through every book", any: [R`(for|while)\s*\(?[^]{0,60}(length|len|range|books|each|\b[78]\b)`, R`for\s+(each\s+)?\w+\s+(in|of|from)\b`, COMPR9] },
              { desc: "the book's genre compared (equal) with the genre parameter", any: [CMP9] },
              { desc: "a counter starting at 0 and increased by 1 inside the selection", any: [R`(\w+)\s*(=|to|initially)\s*0\b[^]{0,260}${CMP9}[^]{0,140}(\1\s*(=|to)\s*\1\s*\+\s*1|\1\s*\+=\s*1|\1\s*\+\+|\+\+\s*\1)`, COMPR9] },
              { desc: "the count of matching books is returned", any: [R`${CMP9}[^]{0,300}return\s+(?!\d)[a-z_]\w*`, R`return\s+(?!\d)[a-z_]\w*[^]{0,300}${CMP9}`] },
            ],
            sample: 'FUNCTION countGenre(ARRAY OF Book books, STRING genre) RETURNS INTEGER\n   DECLARE count INITIALLY 0\n   FOR index FROM 0 TO length(books) - 1 DO\n      IF books[index].genre = genre THEN\n         SET count TO count + 1\n      END IF\n   END FOR\n   RETURN count\nEND FUNCTION',
            model: "<p>(1) function with books and genre as parameters; (1) fixed loop over all books (every book must be checked); (1) compare each book's genre with the parameter; (1) counter set to 0 before the loop and increased by 1 inside the IF; (1) return the count (a variable, not a typed-in number). Using one function with a genre parameter, not a different function for each genre, is the efficient solution.</p>" + pre('FUNCTION countGenre(ARRAY OF Book books, STRING genre) RETURNS INTEGER\n   DECLARE count INITIALLY 0\n   FOR index FROM 0 TO length(books) - 1 DO\n      IF books[index].genre = genre THEN\n         SET count TO count + 1\n      END IF\n   END FOR\n   RETURN count\nEND FUNCTION'),
          },
          { label: "(b)", type: "num", marks: 1, q: "State the value returned by the call countGenre(books, \"Crime\") using the data in the table. [1]", a: 4, tol: 0, why: "Crime is at indexes 0, 2, 4 and 7, so the count is 4." },
        ],
      },
      /* ---------------------------------------------------------------- 10 */
      {
        id: "prog-10",
        style: "Write code · linear search",
        stem:
          "<p>An Air Cadet flight stores its members' names in a 1-D array called <code>names</code>, which holds 5 names: Ross, Ailsa, Callum, Mhairi, Freya (indexes 0 to 4).</p>",
        parts: [
          {
            label: "(a)", type: "code", marks: 5,
            q: "Write a function that is passed the array and a name to look for. It must return the index where the name is found, or -1 if the name is not in the array. [5]",
            points: [
              { desc: "a function with two parameters (array and target name)", any: [FUNC2] },
              { desc: "the 'not found' result of -1 is set up or returned (after the search, not inside the match)", not: [R`${CMP10}(?:(?!return)[^]){0,40}return\s+(-1|none|false)`], any: [R`return\s+(-1|none|false)`, R`\w+\s*(=|to|initially)\s*-1`] },
              { desc: "a loop that goes through the array (limited by its length)", any: [R`(for|while)[^]{0,60}(len|length|range|names|\b[45]\b)`] },
              { desc: "each name compared with the target (equals, not 'not equal')", any: [CMP10] },
              { desc: "the index is stored (or returned) when the name IS found", any: [R`${CMP10}(?:(?!return)[^]){0,60}(return\s+(\w*(index|pos|idx)\w*|[ijkn])\b|(set\s+)?\w+\s*(to|=)\s*(index|i|idx|pos|j|k|n)\b)`] },
              { desc: "the loop stops once the name is found (conditional loop, break or early return of the index)", any: [R`${CMP10}(?:(?!return)[^]){0,60}(break|return\s+(\w*(index|pos|idx)\w*|[ijkn])\b)`, R`while[^]{0,60}(not\s+\w*found|!\s*\w*found|\w*found\s*={1,3}\s*(false|0)|(and|&&)\s*\w+\s*={1,3}\s*-1)`] },
            ],
            sample: 'FUNCTION findName(ARRAY OF STRING names, STRING target) RETURNS INTEGER\n   DECLARE position INITIALLY -1\n   DECLARE index INITIALLY 0\n   WHILE index < length(names) AND position = -1 DO\n      IF names[index] = target THEN\n         SET position TO index\n      END IF\n      SET index TO index + 1\n   END WHILE\n   RETURN position\nEND FUNCTION',
            model: "<p>Any 5 of 6: (1) function with the array and target as parameters; (1) -1 as the 'not found' value; (1) loop limited by the array length; (1) compare each name with the target; (1) store/return the index when found; (1) stop searching once found (conditional loop using a found flag, or break/early return). The sample uses a WHILE loop whose condition fails once the position is set.</p>" + pre('FUNCTION findName(ARRAY OF STRING names, STRING target) RETURNS INTEGER\n   DECLARE position INITIALLY -1\n   DECLARE index INITIALLY 0\n   WHILE index < length(names) AND position = -1 DO\n      IF names[index] = target THEN\n         SET position TO index\n      END IF\n      SET index TO index + 1\n   END WHILE\n   RETURN position\nEND FUNCTION'),
          },
          { label: "(b)", type: "num", marks: 1, q: "Your function is used to search for \"Callum\". How many names are compared with the target before the search stops? [1]", a: 3, tol: 0, why: "Ross (0), Ailsa (1) and Callum (2) are compared; the search stops after the third comparison." },
          {
            label: "(c)", type: "text", marks: 2,
            q: "Explain why it is more efficient to use a loop that quits early, rather than one that always checks all five names. [2]",
            points: [
              { desc: "the search ends as soon as the name is found", negOK: true, not: [R`(not|n't|never)\s+(\w+\s+)?(stop|end|exit|quit|finish|break)`, R`(as soon as|once|immediately)\s+(\w+\s+){0,3}(is|are)\s+not\s+(found|located|matched)`], any: [R`(stop\w*|exit\w*|end\w*|finish\w*|break\w*|quit\w*|leav\w*|terminat\w*)[^]{0,40}(as soon as|once|when|immediately|after|if)[^]{0,30}(found|match\w*|find\w*|locat\w*|there)`, R`(as soon as|once|when|immediately|if)[^]{0,30}(found|match\w*|locat\w*|it finds)[^]{0,50}(stop\w*|exit\w*|end\w*|finish\w*|break\w*|quit\w*|leav\w*|terminat\w*)`] },
              { desc: "so the remaining items are skipped, saving time (especially for a long array)", negOK: true, not: [R`\b(is|are)\s+not\s+(\w+\s+)?(skipped|ignored)`], any: [R`(rest|remaining|other|skipp\w+|further|unnecessar\w+|pointless\w*|needless\w*|wast\w+)[^]{0,40}(items|names|elements|array|checks?|comparisons?|loops?|repeats?|checking)`, R`(saves?|saving|less|faster|quicker)[^]{0,20}(time|processing)`] },
            ],
            sample: "The loop stops as soon as the name is found. The remaining names in the array are skipped, which saves time, especially when the array is very long.",
            model: "<p>(1) The loop ends as soon as the item is found (conditional loop); (1) the rest of the array is not checked, so fewer comparisons and less time are used. A fixed loop would carry on to the end regardless.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 11 */
      {
        id: "prog-11",
        style: "Debugging · errors in given code",
        stem:
          "<p>The array <code>marks</code> holds the test marks of 8 pupils; the first mark is at index 0. The code below should display \"Pass\" if the class average is at least 50, otherwise \"Fail\". It contains errors.</p>" +
          pre('1  DECLARE total INITIALLY 0\n2  FOR index FROM 1 TO 8 DO\n3     SET total TO total + marks[index]\n4  END FOR\n5  SET average TO total / 7\n6  IF average = 50 THEN\n7     SEND "Pass" TO DISPLAY\n8  ELSE\n9     SEND "Fail" TO DISPLAY\n10 END IF'),
        parts: [
          {
            label: "(a)", type: "multi", marks: 3,
            q: "Which THREE lines contain an error? [3]",
            opts: ["Line 1", "Line 2", "Line 3", "Line 5", "Line 6", "Line 9"],
            a: [1, 3, 4],
            why: "Line 2: the loop should run from 0 to 7. Line 5: there are 8 marks, so divide by 8. Line 6: = tests for exactly 50, so it should be >= 50. Lines 1, 3 and 9 are correct.",
          },
          {
            label: "(b)", type: "mcq", marks: 1,
            q: "When index reaches 8, marks[index] asks for an element that does not exist. What type of error is this? [1]",
            opts: ["Syntax error", "Execution (run-time) error", "Logic error", "It is not an error"],
            a: 1,
            why: "The code translates, but crashes while running because it asks for something impossible, an index that does not exist: an execution error.",
          },
          {
            label: "(c)", type: "code", marks: 3,
            q: "Rewrite lines 2, 5 and 6 so that the program is correct. [3]",
            points: [
              { desc: "loop covers indexes 0 to 7", any: [R`0\s+to\s+(7|length\(\s*\w+\s*\)\s*-\s*1)`, R`range\s*\(\s*(0\s*,\s*)?(8|len\s*\(\s*marks\s*\))\s*\)`, R`\w+\s*=\s*0\s*;\s*\w+\s*<\s*(8|\w+\.length)`, R`<=\s*7\b`, R`for\s+(each\s+)?\w+\s+(in|from|of)\s+marks`] },
              { desc: "total divided by 8 (the number of marks)", any: [R`total\s*/\s*(8|len\s*\(|length|\w*count)`, R`/\s*8\b`] },
              { desc: "the comparison is >= 50 (or > 49)", any: [R`(>=|≥)\s*50`, R`>\s*49`] },
            ],
            sample: "2  FOR index FROM 0 TO 7 DO\n5  SET average TO total / 8\n6  IF average >= 50 THEN",
            model: "<p>(1) <code>FOR index FROM 0 TO 7</code> (or <code>range(8)</code>, or a for-each over marks); (1) <code>total / 8</code>; (1) <code>average &gt;= 50</code>. Only the corrected lines are asked for; 2025 report: say what code to add or change precisely.</p>",
          },
          {
            label: "(d)", type: "text", marks: 2,
            q: "Describe how a breakpoint set on line 5 would help find the error in the average. [2]",
            points: [
              { desc: "the program runs at full speed then pauses when it reaches line 5", any: [R`(pause\w*|stop\w*|halt\w*|freez\w*)\s+(\w+\s+){0,3}(at|on|when|before|once)\s+(\w+\s+){0,3}(line|reach\w*|this point|that point|the breakpoint|it)`, R`(reach\w*|hits?|gets? to|arrives? at)\s+(\w+\s+){0,2}(line|breakpoint|it)[^]{0,60}(pause\w*|stop\w*|halt\w*|freez\w*)`] },
              { desc: "the programmer can then inspect the value of total (or the variables)", any: [R`(inspect\w*|check\w*|look\w* at|view\w*|see\w*|examin\w*|read\w*|show\w*)[^]{0,60}(total|value|variables?)`] },
            ],
            sample: "The program runs until it reaches line 5 and then pauses. The programmer can then look at the value of total and the other variables and check that they are right before the average is worked out.",
            model: "<p>(1) The program runs normally and pauses (halts) when line 5 is reached; (1) the programmer can inspect the variables, e.g. total, at that point to see whether the loop has added up the right marks before the division.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 12 */
      {
        id: "prog-12",
        style: "Write code · writing a CSV file",
        stem:
          "<p>The array of records <code>cadets</code> holds 8 cadets.</p>" +
          pre('RECORD Cadet IS {STRING name, STRING flight, INTEGER hours}\nDECLARE cadets AS ARRAY OF Cadet INITIALLY [ Cadet("", "", 0) ] * 8') +
          "<p>The data is to be saved in a CSV file called <code>squadron.csv</code>, with one cadet on each line, the three fields separated by commas, for example <code>Ailsa,B,31</code>.</p>",
        parts: [
          {
            label: "(a)", type: "code", marks: 5,
            q: "Write a procedure that is passed the array of cadets and saves them to the file. [5]",
            points: [
              { desc: "a procedure with the array as a parameter", any: [R`(procedure|def|function|sub)\s+\w+\s*\(\s*\w+`] },
              { desc: "the file is created (or opened for writing)", any: [R`create\s+["']`, R`open\s*\([^)]*["'][wa]\+?["']`, R`open\s+["'][^"']+["']\s+(for\s+)?(writing|output)`, R`(fopen|filewriter|printwriter|writefile)`] },
              { desc: "a loop through every cadet", any: [R`(for|while)[^]{0,60}(cadets|len|range|\b[78]\b|length|each)`] },
              { desc: "the name, flight and hours of the cadet are all written", any: [R`\.name\b[^]{0,100}\.flight\b[^]{0,100}\.hours\b`] },
              { desc: "the fields are separated by commas", any: [R`["'],["']`, R`\},\{`, R`join\s*\(`] },
              { desc: "the file is closed", any: [R`close`] },
            ],
            sample: 'PROCEDURE saveCadets(ARRAY OF Cadet cadets)\n   CREATE "squadron.csv"\n   FOR index FROM 0 TO 7 DO\n      SEND cadets[index].name & "," & cadets[index].flight & "," & cadets[index].hours TO "squadron.csv"\n   END FOR\n   CLOSE "squadron.csv"\nEND PROCEDURE',
            model: "<p>Any 5 of 6: (1) procedure with cadets as parameter; (1) create/open the file for writing; (1) loop through all 8 cadets; (1) all three fields of each cadet written on one line; (1) commas between the fields; (1) close the file. In Python, remember <code>str(hours)</code> and a newline <code>\"\\n\"</code>.</p>" + pre('PROCEDURE saveCadets(ARRAY OF Cadet cadets)\n   CREATE "squadron.csv"\n   FOR index FROM 0 TO 7 DO\n      SEND cadets[index].name & "," & cadets[index].flight & "," & cadets[index].hours TO "squadron.csv"\n   END FOR\n   CLOSE "squadron.csv"\nEND PROCEDURE'),
          },
          {
            label: "(b)", type: "text", marks: 2,
            q: "Explain why the file must be closed when the procedure has finished writing. [2]",
            points: [
              { desc: "closing makes sure all the data is saved (buffered data written out)", negOK: true, not: [R`(makes? sure|ensures?)[^.]{0,40}\bnot\b`, R`all\s+(of\s+)?the\s+(data|lines|records|text|contents)\s+(is|are)\s+not`], any: [R`(buffer\w*|flush\w*)[^]{0,60}(written|saved|stored|disk|file|lost|empty|out)`, R`(written|saved|stored|disk|file|lost)[^]{0,60}(buffer\w*|flush\w*)`, R`all (of )?the (data|lines|records|text|contents)[^]{0,40}(sav\w+|written|stored)`, R`(sav\w+|written|stored)[^]{0,25}(to )?(disk|properly|fully|completely|permanent\w*)`, R`(data|lines|records|text|changes)[^]{0,40}\b(lost|missing|incomplete|not (be )?(saved|written|stored))`] },
              { desc: "and frees the file so other programs can use it (or avoids loss/corruption)", negOK: true, not: [R`(frees?|releases?)\s+(the\s+)?file\s+so\s+(that\s+)?[^.]{0,30}\bcan\s+not`, R`nothing\s+(is|was)\s+not`], any: [R`(free\w*|releas\w*|unlock\w*|available)[^]{0,40}(file|other|programs?|users?|processes)`, R`(other (programs?|users?|processes))[^]{0,40}(open\w*|use|access\w*|read\w*|write|writing|blocked|locked)`, R`(file|data)[^]{0,30}(lock\w*|corrupt\w*|lost\b|loss)|(lock\w*|corrupt\w*|data (is |being |could be |may be )?lost|loss of data|lose (the |some )?data)`] },
            ],
            sample: "Closing the file makes sure that all the data is saved to the disk. It also frees the file so that other programs can open it, and nothing is lost or corrupted.",
            model: "<p>(1) Closing saves any data still held in the buffer, so the whole file is written; (1) it releases the file for other programs and avoids data loss or corruption.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 13 */
      {
        id: "prog-13",
        style: "Calculate · pre-defined functions and strings",
        stem:
          "<p>A ferry loads cars in rows of 8. On one crossing 137 cars arrive. Use these pre-defined functions: <code>int(x)</code> removes the fraction of a real number (it does not round), <code>a MOD b</code> gives the remainder after dividing a by b, and <code>ord(ch)</code> gives the ASCII code of a character (<code>ord(\"A\")</code> is 65).</p>",
        parts: [
          { label: "(a)", type: "num", marks: 1, q: "State the value of int(137 / 8), the number of complete rows. [1]", a: 17, tol: 0, why: "137 / 8 = 17.125, and int removes the fraction, giving 17." },
          { label: "(b)", type: "num", marks: 1, q: "State the value of 137 MOD 8, the number of cars in the last, incomplete row. [1]", a: 1, tol: 0, why: "137 = 17 x 8 + 1, so the remainder is 1." },
          { label: "(c)", type: "num", marks: 1, q: "A ticket code letter is shifted along the alphabet by this expression, where ord(\"X\") is 88: (ord(\"X\") - ord(\"A\") + 3) MOD 26. State its value. [1]", a: 0, tol: 0, why: "88 - 65 + 3 = 26, and 26 MOD 26 = 0 (the shift wraps round to the start of the alphabet)." },
          {
            label: "(d)", type: "code", marks: 3,
            q: "A passenger code is made from the first 3 letters of the passenger's surname followed by the number of letters in the surname, so \"MacLeod\" gives \"Mac7\". Write code to take a surname that is already stored in a variable called surname, and display the code. [3]",
            points: [
              { desc: "the first three characters extracted", any: [FIRST3] },
              { desc: "the length of the surname found", any: [R`(len|length)\s*\(`, R`\.length`] },
              { desc: "first three letters THEN the length joined (in that order) and displayed", all: [R`\b(send|print|console\.log|return|alert|document\.write)\b`, R`(${FIRST3}[^]{0,40}(&|\+|,|\{|\}|concat|\|\|)[^]{0,25}\b(len|length)\b|(?<v>\w+)\s*(=|to)\s*(\w+)?${FIRST3}[^]{0,80}\k<v>\s*(&|\+|,|concat)\s*(str\s*\(\s*)?\(?\s*(len|length)\b|(?<a>\w+)\s*(=|to)\s*(\w+)?${FIRST3}[^]{0,100}(?<b>\w+)\s*(=|to)\s*(str\s*\(\s*)?(len|length)\s*\([^]{0,100}\k<a>\s*(&|\+|,)\s*(str\s*\(\s*)?\k<b>)`], win: 220 },
            ],
            sample: 'SET code TO left(surname, 3) & length(surname)\nSEND code TO DISPLAY',
            model: "<p>(1) first three letters, e.g. <code>surname[0:3]</code> or <code>left(surname, 3)</code>; (1) length of the surname with a length/len function; (1) joined together (concatenated, converting the number if the language needs it) and displayed. Python: <code>print(surname[0:3] + str(len(surname)))</code>.</p>" + pre('SET code TO left(surname, 3) & length(surname)\nSEND code TO DISPLAY'),
          },
        ],
      },
      /* ---------------------------------------------------------------- 14 */
      {
        id: "prog-14",
        style: "Trace and read code · nested loops, selection",
        stem:
          "<p>Screen 3 at a cinema has 3 rows of 4 seats. This code is part of its booking program.</p>" +
          pre('SET offers TO 0\nFOR row FROM 1 TO 3 DO\n   FOR seat FROM 1 TO 4 DO\n      IF (row + seat) MOD 2 = 0 THEN\n         SET offers TO offers + 1\n      END IF\n   END FOR\nEND FOR\nSEND offers TO DISPLAY'),
        parts: [
          { label: "(a)", type: "num", marks: 1, q: "How many times is the IF statement executed? [1]", a: 12, tol: 0, why: "The outer loop runs 3 times and the inner loop 4 times each time: 3 x 4 = 12." },
          { label: "(b)", type: "num", marks: 1, q: "State the value displayed. [1]", a: 6, tol: 0, why: "Row 1: seats 1 and 3 (sum 2 and 4). Row 2: seats 2 and 4 (sums 4 and 6). Row 3: seats 1 and 3 (sums 4 and 6). That is 2 + 2 + 2 = 6." },
          {
            label: "(c)", type: "text", marks: 2,
            q: "Describe what this code does, in the context of the cinema. [2]",
            points: [
              { desc: "counts (how many) seats that meet a condition, with the offer", all: [R`(count\w*|how many|number of|total\w*|tally|works out)`, R`(seat|ticket)`], win: 120 },
              { desc: "by checking every seat in every row; the condition is row + seat being even", any: [R`\b(every|each|all|whole)\s+(the\s+)?(seat|row)s?\b`, R`(row|seat)[^]{0,30}\b(even|divisible by 2|multiple of 2|remainder (of )?0)\b`, R`\b(even|divisible by 2|multiple of 2)\b[^]{0,30}(row|seat|sum|total|add)`] },
            ],
            sample: "It counts how many seats on the screen get the offer. It checks every seat in every row, and a seat counts when its row number plus its seat number is even.",
            model: "<p>(1) Counts the number of seats (out of 12) that qualify for the offer; (1) by going through every seat in every row and testing whether row + seat is even. 'It has two loops and an IF' with no reference to seats scores nothing.</p>",
          },
          {
            label: "(d)", type: "mcq", marks: 1,
            q: "A different part of the program uses this selection to turn a mark into a grade:  IF mark >= 70 THEN grade is \"A\"; ELSE IF mark >= 60 THEN \"B\"; ELSE IF mark >= 50 THEN \"C\"; ELSE \"No award\". What grade is given for a mark of 60? [1]",
            opts: ["A", "B", "C", "No award"],
            a: 1,
            why: "60 is not >= 70, but it is >= 60, so the second test is true and the grade is B. The boundary value 60 is why >= matters.",
          },
        ],
      },
      /* ---------------------------------------------------------------- 15 */
      {
        id: "prog-15",
        style: "Evaluate · readability, modularity and efficient use of constructs",
        stem:
          "<p>A trainee wrote this code to count how many pupils chose each of two clubs. Both arrays have 30 elements.</p>" +
          pre('PROCEDURE p1(INTEGER a)\nDECLARE x INITIALLY 0\nFOR i FROM 0 TO 29 DO\nIF s[i] = a THEN\nSET x TO x + 1\nEND IF\nEND FOR\nSEND x TO DISPLAY\nEND PROCEDURE\nPROCEDURE p2(INTEGER a)\nDECLARE x INITIALLY 0\nFOR i FROM 0 TO 29 DO\nIF t[i] = a THEN\nSET x TO x + 1\nEND IF\nEND FOR\nSEND x TO DISPLAY\nEND PROCEDURE'),
        parts: [
          {
            label: "(a)", type: "text", marks: 3,
            q: "Describe three changes that would make this code easier for another programmer to read. [3]",
            points: [
              { desc: "meaningful (descriptive) names for the sub-programs and variables", all: [R`(meaningful|descriptive|sensible|clear|better|proper|suitable|understandable)`, R`(names?|identifiers?)`], win: 50 },
              { desc: "indentation of the code inside loops and selections", any: [R`indent\w*`] },
              { desc: "white space (blank lines) between sub-programs / sections", any: [R`(white ?space|blank lines?|spacing|line breaks?|empty lines?)`] },
              { desc: "comments (internal commentary) explaining the code", any: [R`(comment\w*|internal commentary|annotat\w*)`] },
            ],
            sample: "The names should be meaningful, such as countClubA instead of p1 and count instead of x. The code inside the loops and the IF statements should be indented. Comments should say what each procedure does.",
            model: "<p>Any 3: (1) meaningful names for sub-programs and variables; (1) indentation inside loops and selections; (1) white space (blank lines) between blocks; (1) internal commentary (comments) saying what the code does.</p>",
          },
          {
            label: "(b)", type: "text", marks: 2,
            q: "The two procedures are almost identical. Describe how they could be replaced to make better use of coding constructs. [2]",
            points: [
              { desc: "one sub-program (procedure/function) replaces both", any: [R`(one|single|same|just one|only one)\s+(\w+\s+)?(procedure|sub-?program|function|module)`] },
              { desc: "the array to be counted is passed as an extra parameter, and the sub-program is called twice with different actual parameters", all: [R`(array|list|data)[^]{0,40}(parameter|argument)|(parameter|argument)[^]{0,40}(array|list|data)`, R`(twice|two times|once for each|each club|both clubs|different (arrays|lists))`], win: 200 },
            ],
            sample: "Replace them with a single procedure that is given the array as a parameter, as well as the club number. It can then be called twice with different arrays, once for each club.",
            model: "<p>(1) Write one sub-program instead of two; (1) the array (the data that differs) is passed as a parameter, and the sub-program is called twice with different actual parameters. This is the 2025 report's 'one sub-program called twice' point.</p>",
          },
          {
            label: "(c)", type: "mcq", marks: 1,
            q: "Which is an advantage of dividing a program into sub-programs? [1]",
            opts: [
              "A change to one task only has to be made in one place",
              "The program uses less memory for every variable",
              "Syntax errors no longer happen",
              "Global variables can be used more safely",
            ],
            a: 0,
            why: "Modular code is easier to maintain: each task lives in one sub-program, so a change is made once. It does not remove syntax errors and does not make globals safer.",
          },
        ],
      },
      /* ---------------------------------------------------------------- 16 */
      {
        id: "prog-16",
        style: "Extended · read a design, read and write code",
        stem:
          "<p>The squadron's flying log holds 8 cadets in an array of records, <code>cadets</code>, with fields <code>name</code>, <code>flight</code> and <code>hours</code>. The hours in index order are 12, 31, 7, 31, 18, 25, 9, 22. Part of the program is shown.</p>" +
          pre('FUNCTION findTopPos(ARRAY OF Cadet cadets) RETURNS INTEGER\n   DECLARE topPos INITIALLY 0\n   FOR index FROM 1 TO 7 DO\n      IF cadets[index].hours > cadets[topPos].hours THEN\n         SET topPos TO index\n      END IF\n   END FOR\n   RETURN topPos\nEND FUNCTION\n\nSET best TO findTopPos(cadets)'),
        parts: [
          {
            label: "(a)", type: "text", marks: 2,
            q: "Describe what the function findTopPos achieves in the context of the flying log. [2]",
            points: [
              { desc: "finds the cadet who has flown the most hours", all: [R`\b(most|highest|top|maximum|largest|greatest|biggest)\b`, R`\b(hours|flown|flying|flight time)\b`], win: 80 },
              { desc: "and returns the position (index) of that cadet in the array", any: [R`\b(returns?|returned|gives?|sends?|passes?|outputs?|gives back|hands back)\s+(\w+\s+){0,2}(position|index|location|subscript)\b`, R`\b(position|index|location)\b[^]{0,30}\b(of|for)\b[^]{0,20}\b(that|the|this)\s+(cadet|one|person|pupil|member)`] },
            ],
            sample: "It finds the cadet who has flown the most hours. The function returns the position of that cadet in the array of cadets.",
            model: "<p>(1) Finds the cadet with the highest flying hours (the maximum); (1) returns the position (index) of that cadet, not the hours themselves.</p>",
          },
          { label: "(b)", type: "num", marks: 1, q: "State the value stored in best after the call, using the hours given. [1]", a: 1, tol: 0, why: "index 1: 31 > 12, so topPos = 1. Later values (7, 31, 18, 25, 9, 22) are never greater than 31 (the second 31 is equal, not greater), so topPos stays 1." },
          {
            label: "(c)", type: "text", marks: 2,
            q: "The loop starts at index 1 rather than index 0. Explain why this is correct. [2]",
            points: [
              { desc: "topPos starts as the first cadet (index 0), taken as the highest so far", any: [R`(assum\w+|taken as|treated as|considered|already)[^]{0,50}(highest|biggest|largest|maximum|most|top|best|so far)`, R`(assum\w+|taken as|treated as)[^]{0,50}(first|index 0|zero)`] },
              { desc: "so only the other cadets need to be compared with it (comparing the first with itself is pointless)", any: [R`(only|just|remaining|rest|other|others|every other|after)[^]{0,60}(compar\w+|check\w*|tested)`, R`(compar\w+|check\w*)[^]{0,50}(itself|with itself|pointless|waste\w*|unnecessar\w+|no need)`] },
            ],
            sample: "topPos starts at 0, so the first cadet is assumed to be the highest so far. Only the remaining cadets then need to be compared with it, because comparing the first cadet with itself would be pointless.",
            model: "<p>(1) topPos is initialised to 0, so the first cadet is already taken as the highest so far; (1) only the other cadets (index 1 onwards) need to be compared with it; starting at 0 would compare the first cadet with itself.</p>",
          },
          {
            label: "(d)", type: "code", marks: 3,
            q: "Write a procedure that is passed the array of cadets and a minimum number of hours, and displays the name of every cadet who has flown at least that many hours. [3]",
            points: [
              { desc: "a loop through all cadets, with the test inside it", all: [R`(for|while)[^]{0,60}(cadets|len|range|\b[78]\b|length|each)`, R`\.hours\s*(>=|≥)\s*\w+|\w+\s*(<=|≤)\s*\w+\.hours`], win: 200 },
              { desc: "selection testing hours >= the minimum (at least, so equal counts)", any: [R`\.hours\s*(>=|≥)\s*\w+`, R`\w+\s*(<=|≤)\s*\w+\.hours`, R`\.hours\s*>\s*\w+\s*-\s*1`] },
              { desc: "the cadet's name displayed inside the selection", all: [R`\.hours\s*(>=|≥)\s*\w+|\w+\s*(<=|≤)\s*\w+\.hours`, R`(send|print|console\.log|display|alert|write)[^]{0,60}\.name`], win: 200 },
              { desc: "a procedure with the array and the minimum as its parameters", any: [FUNC2] },
            ],
            sample: 'PROCEDURE showCadets(ARRAY OF Cadet cadets, INTEGER minHours)\n   FOR index FROM 0 TO length(cadets) - 1 DO\n      IF cadets[index].hours >= minHours THEN\n         SEND cadets[index].name TO DISPLAY\n      END IF\n   END FOR\nEND PROCEDURE',
            model: "<p>Any 3 of 4: (1) fixed loop through every cadet; (1) selection with <code>&gt;=</code> (at least); (1) name displayed for each cadet that passes the test; (1) procedure with cadets and the minimum hours as parameters (and no unnecessary extra parameters).</p>" + pre('PROCEDURE showCadets(ARRAY OF Cadet cadets, INTEGER minHours)\n   FOR index FROM 0 TO length(cadets) - 1 DO\n      IF cadets[index].hours >= minHours THEN\n         SEND cadets[index].name TO DISPLAY\n      END IF\n   END FOR\nEND PROCEDURE'),
          },
        ],
      },
    ],
  };
})();
