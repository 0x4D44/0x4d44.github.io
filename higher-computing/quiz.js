/* Pre-flight check question bank.
   type "mcq": opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (HTML), self-marked. */
window.HC_QUIZ = {
  /* ---------------- SOFTWARE DESIGN & DEVELOPMENT ---------------- */
  "sdd-methods": {
    title: "Methodologies",
    questions: [
      { q: "In which methodology is testing carried out alongside programming, with no separate testing phase?", opts: ["Iterative", "Agile", "Both", "Neither"], a: 1, why: "Agile tests within every sprint. Iterative development has a testing phase after implementation is complete." },
      { q: "A client is not yet sure exactly what they want and expects their needs to change. Which statement best explains why agile suits them?", opts: ["Agile produces more documentation, so the requirements are clearer", "Agile is predictive, so all changes are planned for at the start", "The client gives feedback on working prototypes after each sprint, so changes can be built into the next sprint", "Agile uses separate teams of analysts and programmers"], a: 2, why: "Agile is adaptive: regular client feedback on prototypes lets the software change direction quickly." },
      { type: "open", q: "Compare iterative and agile methodologies in terms of <b>client interaction</b>.", marks: 2, model: "<ul><li>Iterative: the client is involved mainly at the <b>start</b> (analysis) and at the <b>end</b> (evaluation), with little contact in between. (1)</li><li>Agile: the client is involved <b>throughout</b>, giving regular feedback on prototypes, which is acted on in the next sprint. (1)</li></ul><p>To earn both marks the answer must compare the two, not just describe one.</p>" },
    ],
  },
  "sdd-analysis": {
    title: "Analysis",
    questions: [
      { q: "\"The finished program, test results and an evaluation report will be delivered within three weeks.\" This statement is part of the…", opts: ["purpose", "scope", "boundaries", "functional requirements"], a: 1, why: "Deliverables and time limits form the scope." },
      { q: "\"The program assumes the input file always holds 50 valid records.\" This is a…", opts: ["boundary", "functional requirement", "purpose", "scope"], a: 0, why: "Boundaries state the limits of the project and the assumptions made by the developers." },
      { q: "Functional requirements are described in terms of…", opts: ["purpose, scope and boundaries", "inputs, processes and outputs", "usability, robustness and maintainability", "syntax, execution and logic"], a: 1, why: "Functional requirements = the inputs, processes and outputs the program must deliver." },
    ],
  },
  "sdd-design": {
    title: "Design",
    questions: [
      { q: "In a SQA structure diagram, which symbol shows a <b>loop</b>?", opts: ["A rectangle", "A rectangle with rounded (semicircular) ends", "A hexagon", "A rectangle with double vertical sides"], a: 1, why: "Process = rectangle, loop = rounded ends, selection = hexagon, predefined process = double-sided rectangle." },
      { q: "A sub-program <code>find_cheapest</code> reads an array of prices and works out the position of the lowest price. Which data flow is correct?", opts: ["IN: position  OUT: prices()", "IN: prices()  OUT: position", "IN: prices(), position  OUT: prices()", "OUT: prices(), position"], a: 1, why: "It reads prices (IN) and produces the position (OUT). Passing the prices back out is unnecessary because they are not changed." },
      { q: "Which of these is <em>not</em> required to be shown when designing a modular solution at Higher?", opts: ["Top level design", "Data flow", "Refinements", "Test data"], a: 3, why: "A Higher design shows top level design, data flow and refinements. Test data belongs in the test plan." },
    ],
  },
  "sdd-data": {
    title: "Data structures",
    questions: [
      { q: "A program stores each pupil's name, age and whether they have paid. Which is the most suitable data structure?", opts: ["One 1D array of strings", "An array of records with fields name (string), age (integer), paid (Boolean)", "Three separate variables", "A single record"], a: 1, why: "Many items, each with fields of different types → an array of records." },
      { q: "With parallel arrays <code>names</code> and <code>hours</code>, what links Ailsa's name to her hours?", opts: ["They have the same value", "They are stored at the same index in each array", "A record", "A foreign key"], a: 1, why: "Parallel arrays rely on the shared index: names[1] and hours[1] belong to the same cadet." },
      { type: "open", q: "Using any language, declare a record structure for a ship with fields name, guns (integer) and launched (year), then declare an array of 20 ships.", marks: 3, model: "<pre>@dataclass\nclass Ship:\n    name: str\n    guns: int\n    launched: int\n\nfleet = [Ship(\"\", 0, 0) for i in range(20)]</pre><p>1 mark: record with all three fields. 1 mark: suitable types. 1 mark: an array of 20 records. Reference language: <code>RECORD Ship IS {STRING name, INTEGER guns, INTEGER launched}</code> and <code>DECLARE fleet AS ARRAY OF Ship INITIALLY [Ship(\"\",0,0)] * 20</code>.</p>" },
    ],
  },
  "sdd-subprograms": {
    title: "Sub-programs and scope",
    questions: [
      { q: "In <code>total = add_hours(squadron, 5)</code>, what are <code>squadron</code> and <code>5</code>?", opts: ["Formal parameters", "Actual parameters", "Local variables", "Global variables"], a: 1, why: "Values supplied in the call are actual parameters. The names in the definition are the formal parameters." },
      { q: "What is the difference between a function and a procedure?", opts: ["A function cannot take parameters", "A procedure returns a single value; a function does not", "A function returns a single value; a procedure does not", "There is no difference"], a: 2, why: "A function returns a value and is used within an expression. A procedure just carries out a task." },
      { type: "open", q: "Explain why local variables are preferred to global variables.", marks: 2, model: "<ul><li>A local variable can only be changed inside its own sub-program, so other parts of the program cannot alter it by accident. Errors are easier to find. (1)</li><li>Sub-programs become self-contained, with clear inputs and outputs through parameters. They can be tested and reused independently, and the same name can be used in different sub-programs without conflict. (1)</li></ul>" },
    ],
  },
  "sdd-predefined": {
    title: "Pre-defined functions",
    questions: [
      { q: "What is <code>\"BROADSIDE\"[5:9]</code> in Python?", opts: ["\"SIDE\"", "\"DSIDE\"", "\"SIDE\" plus a space", "\"BROAD\""], a: 0, why: "Indexes 5, 6, 7, 8 → S, I, D, E. The end index 9 is not included." },
      { q: "What is <code>45 % 8</code>?", opts: ["5", "5.625", "6", "8"], a: 0, why: "45 = 5 × 8 + 5, so the remainder is 5." },
      { q: "<code>ord(\"C\")</code> returns 67. What does <code>chr(ord(\"C\") + 2)</code> return?", opts: ["\"E\"", "69", "\"C2\"", "\"D\""], a: 0, why: "67 + 2 = 69, and chr(69) is \"E\"." },
      { q: "What does <code>int(9.99)</code> return in Python?", opts: ["10", "9", "9.9", "an error"], a: 1, why: "int() truncates: it cuts off the fractional part rather than rounding." },
    ],
  },
  "sdd-files": {
    title: "File handling",
    questions: [
      { q: "Each line of <code>log.csv</code> is <code>Victory,104,1765</code>. After <code>fields = line.strip().split(\",\")</code>, what type is <code>fields[1]</code>?", opts: ["Integer", "String", "Real", "Boolean"], a: 1, why: "Everything read from a text file is a string. Convert with int(fields[1])." },
      { q: "Why should a file be closed after use?", opts: ["To delete its contents", "To make sure all data is written/saved and to release the file for other programs", "To move to the next line", "To convert it to CSV"], a: 1, why: "Closing flushes any buffered data to storage and frees the file." },
      { q: "In Python, what happens if you open an <em>existing</em> file with mode <code>\"w\"</code>?", opts: ["New text is added to the end", "It is opened read-only", "Its contents are wiped and it is written from the start", "An error occurs"], a: 2, why: "\"w\" creates a new file, or overwrites an existing one. Use \"a\" to append." },
    ],
  },
  "sdd-algorithms": {
    title: "Standard algorithms",
    questions: [
      { q: "Why is a conditional (WHILE) loop more efficient than a fixed loop for linear search?", opts: ["It checks every element twice", "It stops as soon as the item is found", "It sorts the array first", "It uses less memory for the array"], a: 1, why: "The search ends when found becomes true, so unnecessary comparisons are avoided." },
      { q: "A find-minimum algorithm starts with <code>minimum = 0</code>. The data is 12, 7, 31, 4. What goes wrong?", opts: ["Nothing, it returns 4", "It returns 0, because no value is less than 0", "It returns 31", "It crashes"], a: 1, why: "No value is smaller than 0, so minimum stays 0. Always start with the first element." },
      { type: "open", q: "Write code to count how many cadets in <code>cadets</code> (an array of records) have more than 20 flying hours.", marks: 4, model: "<pre>count = 0\nfor index in range(len(cadets)):\n    if cadets[index].hours &gt; 20:\n        count = count + 1\nprint(count)</pre><p>1: counter set to 0 before the loop. 1: a loop over every element. 1: the correct condition on the hours field of the record. 1: the counter incremented inside the IF.</p>" },
    ],
  },
  "sdd-testing": {
    title: "Testing and debugging",
    questions: [
      { q: "A valid mark is 0–50. Which set is <b>extreme</b> test data?", opts: ["25, 30", "0, 50", "-1, 51", "\"fifty\""], a: 1, why: "Extreme data lies on the boundaries of the valid range." },
      { q: "Dividing by a variable that holds 0 causes the program to crash while running. This is a…", opts: ["syntax error", "execution error", "logic error", "boundary error"], a: 1, why: "The code is valid, but fails at run-time: an execution error." },
      { q: "Which debugging technique pauses execution whenever a chosen <b>variable</b> changes?", opts: ["Breakpoint", "Watchpoint", "Dry run", "Trace table"], a: 1, why: "A watchpoint is attached to a variable or condition. A breakpoint is attached to a line." },
      { type: "open", q: "Describe how a breakpoint could help a programmer find a logic error in a loop.", marks: 2, model: "<ul><li>A breakpoint is set on a chosen line, for example the IF inside the loop, and the program runs until it reaches that line and pauses. (1)</li><li>The programmer can then inspect the values of the variables at that moment, step through each pass of the loop, and compare the actual values with the expected values to locate the error. (1)</li></ul>" },
    ],
  },
  "sdd-evaluation": {
    title: "Evaluation",
    questions: [
      { q: "\"The program uses meaningful variable names, comments and one sub-program per task.\" This supports…", opts: ["robustness", "maintainability", "fitness for purpose", "usability"], a: 1, why: "Readability and modularity make the code easier to maintain." },
      { q: "Which statement is about fitness for purpose?", opts: ["The program does not crash when letters are entered", "Every functional requirement in the specification has been met", "The program uses a WHILE loop for the search", "The interface has clear prompts"], a: 1, why: "Fitness for purpose compares the finished program with the specification." },
      { type: "open", q: "A program reads 30 race times and finds the fastest. It stops with an error if a time is typed as \"ten\". Evaluate its robustness.", marks: 1, model: "<p>The program is <b>not robust</b>. Entering non-numeric data such as \"ten\" causes an execution error, a crash, instead of an error message and a request to re-enter. (1)</p><p>A Higher answer names the specific input that fails and what should happen instead.</p>" },
    ],
  },

  /* ---------------- COMPUTER SYSTEMS ---------------- */
  "cs-twos": {
    title: "Two's complement",
    questions: [
      { q: "What is the 8-bit two's complement number <code>11100110</code> in denary?", opts: ["230", "−26", "−102", "−230"], a: 1, why: "−128 + 64 + 32 + 4 + 2 = −26." },
      { q: "Which is −100 in 8-bit two's complement?", opts: ["<code>01100100</code>", "<code>10011011</code>", "<code>10011100</code>", "<code>11100100</code>"], a: 2, why: "100 = 01100100 → invert 10011011 → add 1 = 10011100. Check: −128 + 16 + 8 + 4 = −100." },
      { q: "What range of integers can 10-bit two's complement store?", opts: ["0 to 1023", "−511 to 511", "−512 to 511", "−1024 to 1023"], a: 2, why: "−2⁹ to 2⁹ − 1 = −512 to 511." },
      { q: "In 8-bit two's complement, what does <code>11111111</code> represent?", opts: ["255", "−127", "−1", "−128"], a: 2, why: "−128 + 127 = −1." },
      { q: "What is the smallest number of bits that can store −300 in two's complement?", opts: ["8", "9", "10", "16"], a: 2, why: "9 bits reach only −256…255. 10 bits reach −512…511." },
    ],
  },
  "cs-float": {
    title: "Floating point",
    questions: [
      { q: "The number of bits given to the <b>mantissa</b> mainly decides the…", opts: ["range", "precision", "sign", "speed"], a: 1, why: "More mantissa bits store more significant digits, giving more precision. More exponent bits give more range." },
      { q: "An 8-bit two's complement exponent is <code>11111101</code>. What is its value?", opts: ["253", "−3", "−125", "3"], a: 1, why: "−128 + 64 + 32 + 16 + 8 + 4 + 1 = −3. A negative exponent means the number is a small fraction." },
      { q: "Sign <code>0</code>, mantissa <code>110000000000000</code>, exponent <code>00000011</code>. What number is stored?", opts: ["0.75", "6", "12", "−6"], a: 1, why: "0.11 × 2³ → move the point 3 places right: 110 = 6." },
      { q: "If bits are moved from the mantissa to the exponent (keeping the same total), what happens?", opts: ["More range, less precision", "More precision, less range", "Both increase", "Nothing changes"], a: 0, why: "A bigger exponent gives more range. A smaller mantissa gives less precision." },
      { type: "open", q: "Show how 13.5 is stored using 1 sign bit, a 15-bit mantissa and an 8-bit two's complement exponent.", marks: 3, model: "<p>13.5 = 1101.1 in binary = 0.11011 × 2<sup>4</sup></p><ul><li>Sign: <code>0</code> (1)</li><li>Mantissa: <code>110110000000000</code> (1)</li><li>Exponent: <code>00000100</code> (1)</li></ul>" },
    ],
  },
  "cs-text": {
    title: "Unicode and ASCII",
    questions: [
      { q: "How many different characters can 8-bit extended ASCII represent?", opts: ["128", "255", "256", "65 536"], a: 2, why: "2⁸ = 256." },
      { q: "What is the main advantage of Unicode over extended ASCII?", opts: ["It uses less storage", "It can represent far more characters, covering all languages and symbols", "It is faster to type", "It only uses 7 bits"], a: 1, why: "16 or 32 bits per character gives room for tens of thousands, or over a million, characters." },
      { q: "A 1 000-character message is stored in 16-bit Unicode instead of extended ASCII. How does the file size change?", opts: ["It halves", "It stays the same", "It doubles", "It increases eightfold"], a: 2, why: "16 bits per character instead of 8 bits per character is twice the storage." },
    ],
  },
  "cs-graphics": {
    title: "Bitmap and vector",
    questions: [
      { q: "A logo must be printed on a pen and on a 10-metre banner. Which graphic type, and why?", opts: ["Bit-mapped, because it stores every pixel", "Vector, because it is resolution independent and scales without losing quality", "Bit-mapped, because the files are smaller", "Either, it makes no difference"], a: 1, why: "Vector objects are redrawn at any size, so the edges stay sharp." },
      { q: "The file size of a bit-mapped image depends on…", opts: ["the number of objects", "the resolution and colour depth", "the number of colours used in the picture only", "the length of the file name"], a: 1, why: "Width × height × bits per pixel, whatever the picture shows." },
      { q: "Which is an advantage of bit-mapped graphics?", opts: ["Individual pixels can be edited", "They never become pixelated", "Each object can be moved separately", "File size depends on the number of objects"], a: 0, why: "Editing pixel by pixel suits photographs and realistic images." },
    ],
  },
  "cs-fetch": {
    title: "Fetch-execute cycle",
    questions: [
      { q: "What is the <b>first</b> step of the fetch-execute cycle?", opts: ["The read line is activated", "The processor sets up the address bus with the required address", "The instruction is decoded", "The data bus carries the instruction"], a: 1, why: "Address bus first, then the read line, then the data bus, then decode and execute." },
      { q: "Which bus carries the instruction from memory to the processor?", opts: ["Address bus", "Data bus", "Control bus", "Clock bus"], a: 1, why: "The data bus is two-way and carries the instructions and data themselves." },
      { type: "open", q: "Describe the steps of the fetch-execute cycle.", marks: 4, model: "<ol><li>The processor sets up the <b>address bus</b> with the address of the required memory location. (1)</li><li>The processor activates the <b>read line</b> on the <b>control bus</b>. (1)</li><li>The instruction is transferred from memory along the <b>data bus</b> and stored in the <b>instruction register</b>. (1)</li><li>The instruction is <b>decoded</b> and <b>executed</b>. (1)</li></ol>" },
    ],
  },
  "cs-performance": {
    title: "System performance",
    questions: [
      { q: "The data bus is widened from 32 to 64 lines. Why does performance improve?", opts: ["The clock ticks faster", "Twice as many bits are transferred at once, so fewer transfers are needed", "There are more cores", "Memory addresses become shorter"], a: 1, why: "The width of the data bus is the number of bits moved in one transfer." },
      { q: "Why is a dual-core processor not always twice as fast as a single core?", opts: ["Cores share a clock", "Some tasks can't be split evenly between the cores", "Dual-core processors have no cache", "The data bus halves"], a: 1, why: "Work that can't be divided runs on one core while the other waits." },
      { type: "open", q: "Explain how increasing cache memory can improve system performance.", marks: 2, model: "<ul><li>More instructions and data can be stored in cache, so the processor is more likely to find what it needs there: more cache hits. (1)</li><li>Cache is faster to access than main memory, so fewer slower accesses to main memory are needed and instructions are fetched more quickly. (1)</li></ul>" },
    ],
  },
  "cs-environment": {
    title: "Environmental impact",
    questions: [
      { q: "How does a car's start-stop system reduce environmental impact?", opts: ["It lowers the speed limit", "It switches the engine off while the car is stationary, cutting idling, fuel use and emissions", "It recharges the battery from the sun", "It reduces tyre wear"], a: 1, why: "Less idling means less fuel burned and less CO₂ emitted." },
      { q: "How do intelligent traffic control systems reduce emissions?", opts: ["By using cameras and sensors to adjust signals and keep traffic flowing, so there is less stop-start driving", "By banning cars at rush hour", "By making traffic lights brighter", "By printing more tickets"], a: 0, why: "Smooth traffic burns less fuel than stop-start traffic." },
      { type: "open", q: "Describe how a smart heating system can reduce energy use.", marks: 2, model: "<ul><li>It uses sensors and learning to heat rooms only when they are occupied, and only to the preferred temperature. (1)</li><li>It can be controlled remotely by an app, for example switched off if nobody is coming home, so energy is not wasted heating an empty house. (1)</li></ul>" },
    ],
  },
  "cs-cma": {
    title: "Computer Misuse Act",
    questions: [
      { q: "An employee logs into the payroll system without permission to read colleagues' salaries, but changes nothing. Which offence?", opts: ["Unauthorised access to computer material", "Unauthorised access with intent to commit a further offence", "Unauthorised modification of data", "No offence"], a: 0, why: "Reading without authority is unauthorised access, even with no change and no further intent." },
      { q: "A hacker breaks into a bank's systems in order to transfer money to himself. Which offence?", opts: ["Unauthorised access", "Unauthorised access with intent to commit a further offence", "Copyright infringement", "Data protection breach"], a: 1, why: "The access was made to commit another crime (theft/fraud)." },
      { q: "Which is an implication of the Act for a business?", opts: ["It must publish all its data", "It must put security measures in place, and it can prosecute people who misuse its systems", "It can never be hacked", "It must stop using the internet"], a: 1, why: "Businesses need access controls and training, and the Act gives them legal recourse." },
    ],
  },
  "cs-threats": {
    title: "Cookies and DoS",
    questions: [
      { q: "What makes a cookie a <b>tracking</b> cookie?", opts: ["It is stored on the server", "It records the user's browsing across many websites to build a profile", "It contains a virus", "It deletes itself after one visit"], a: 1, why: "Usually set by a third party such as an ad network, to follow the user from site to site." },
      { q: "An attack opens thousands of connections to a server and never completes them, so its connection slots run out. This type of fault is…", opts: ["bandwidth consumption", "resource starvation", "DNS", "a tracking cookie"], a: 1, why: "The server's own resources are used up, so genuine users are refused." },
      { q: "Which is a <b>cost</b> of a DoS attack to a business?", opts: ["Slow performance", "Lost revenue and the labour needed to fix the fault", "Political protest", "A tracking profile"], a: 1, why: "Slow performance is a symptom, and protest is a reason. The costs are lost revenue and the labour to rectify the fault." },
    ],
  },
  "cs-encryption": {
    title: "Encryption",
    questions: [
      { q: "Ailsa wants to send the captain a message only he can read. Which key does she encrypt it with?", opts: ["Her private key", "Her public key", "The captain's public key", "The captain's private key"], a: 2, why: "Encrypt with the receiver's public key. Only the receiver's private key can decrypt." },
      { q: "The captain verifies Ailsa's digital signature using…", opts: ["Ailsa's private key", "Ailsa's public key", "his own private key", "the certificate authority's private key"], a: 1, why: "The signature is made with the sender's private key and checked with the sender's public key." },
      { q: "What does a digital certificate prove?", opts: ["That a message hasn't been altered", "That a public key belongs to the named website or organisation", "That the user has a strong password", "That cookies are disabled"], a: 1, why: "A trusted Certificate Authority vouches for the link between identity and public key." },
    ],
  },

  /* ---------------- DATABASE ---------------- */
  "ddd-analysis": {
    title: "Database analysis",
    questions: [
      { q: "\"The quartermaster wants to see which ships are based in Leith.\" This is…", opts: ["an end-user requirement", "a functional requirement", "a compound key", "a data dictionary entry"], a: 0, why: "It is a task the user wants to do, from their point of view." },
      { q: "Which is best written as a functional requirement?", opts: ["\"I need to know who's on Redstone.\"", "A query to display firstname and surname from Cadet and Posting where shipCode = \"RED\"", "The database should be good", "Users like colourful screens"], a: 1, why: "It names the process (a query), the fields, the tables and the criteria." },
    ],
  },
  "ddd-erd": {
    title: "ERDs and keys",
    questions: [
      { q: "Each posting is on exactly one ship, and each ship receives many postings. What is the Ship–Posting relationship?", opts: ["one-to-one", "one-to-many", "many-to-many", "many-to-one compound"], a: 1, why: "One ship, many postings: crow's foot at the Posting end." },
      { q: "Why can't a relational database implement a many-to-many relationship directly?", opts: ["Too many records", "There is no single place for the foreign key, so a linking entity is needed to make two one-to-many relationships", "SQL has no JOIN", "Primary keys must be numbers"], a: 1, why: "The linking entity (e.g. Posting) holds both foreign keys, resolving M:N into two 1:M relationships." },
      { q: "In Posting, cadetID + shipCode together form the primary key. This is a…", opts: ["foreign key", "compound key", "surrogate key", "alias"], a: 1, why: "A compound key is made from two or more attributes, each a primary key in its own table." },
      { q: "On an SQA ERD, how is a foreign key shown?", opts: ["Underlined", "With an asterisk *", "In bold", "With a crow's foot"], a: 1, why: "Primary keys are underlined. Foreign keys have an asterisk." },
    ],
  },
  "ddd-dictionary": {
    title: "Data dictionary",
    questions: [
      { q: "The <code>rank</code> field may only be Cadet, Cpl, Sgt, FS or CWO. Which validation is this?", opts: ["Presence check", "Restricted choice", "Field length", "Range"], a: 1, why: "The value must come from a fixed list." },
      { q: "What attribute type suits a phone number such as <code>07700 900123</code>?", opts: ["Number", "Text", "Date", "Boolean"], a: 1, why: "It is an identifier, not used in arithmetic, and as a number the leading zero would be lost." },
      { q: "<code>nights</code> must be between 1 and 14. Which validation?", opts: ["Range", "Restricted choice", "Presence", "Field length"], a: 0, why: "A numeric value between limits is a range check." },
    ],
  },
  "ddd-design": {
    title: "Query design",
    questions: [
      { q: "A query must show \"the number of cadets in each rank\". What goes under <b>Grouping</b>?", opts: ["COUNT(*)", "rank", "cadetID", "Nothing"], a: 1, why: "Group by the field that \"each\" refers to: rank." },
      { q: "In an SQA query design, where does the join between two tables appear?", opts: ["Under Search criteria", "It is implied by listing both tables under Table(s) and query", "Under Sort order", "Under Grouping"], a: 1, why: "The design lists the tables. The SQL must then include the join in its WHERE clause." },
    ],
  },
  "ddd-sql": {
    title: "SQL",
    questions: [
      { q: "What is the output of this query on the squadron database?", code: "SELECT homePort, COUNT(*)\nFROM Ship\nWHERE guns > 30\nGROUP BY homePort;", opts: ["Chatham 1 · Leith 2 · Plymouth 1 · Portsmouth 1", "Chatham 1 · Leith 2 · Plymouth 1 · Portsmouth 2", "6", "Leith 2"], a: 0, why: "HMS Cobblestone (24 guns) fails the WHERE, so Portsmouth keeps only Redstone. Leith has Glowstone (74) and Prismarine (38)." },
      { q: "What does this query display?", code: "SELECT MAX(flyingHours) AS [Most hours]\nFROM Cadet\nWHERE squadronNo = 2212;", opts: ["One row, headed Most hours, containing 25", "Kenzie Murray 25", "Three rows: 7, 19 and 25", "40"], a: 0, why: "Squadron 2212 has Callum 7, Euan 19 and Kenzie 25. An aggregate returns one value, under the alias heading." },
      { q: "Which criteria finds surnames whose <b>second</b> letter is \"a\"?", opts: ["<code>LIKE \"a%\"</code>", "<code>LIKE \"%a\"</code>", "<code>LIKE \"_a%\"</code>", "<code>= \"_a%\"</code>"], a: 2, why: "_ matches exactly one character, then \"a\", then % for anything. Wildcards need LIKE, not =." },
      { q: "Why is <code>SELECT surname FROM Cadet WHERE flyingHours = MAX(flyingHours);</code> wrong?", opts: ["MAX only works on text", "An aggregate function can't be used in a WHERE clause", "surname must be grouped", "Nothing is wrong"], a: 1, why: "Find the maximum in one saved query, then use its result in a second query." },
      { q: "When a query has both clauses, which order is correct?", opts: ["ORDER BY then GROUP BY", "GROUP BY then ORDER BY", "Either", "They can't be used together"], a: 1, why: "GROUP BY always comes before ORDER BY." },
      { type: "open", q: "Write SQL to display each homePort with the average number of guns of the ships based there, headed [Average guns].", marks: 3, model: "<pre>SELECT homePort, AVG(guns) AS [Average guns]\nFROM Ship\nGROUP BY homePort;</pre><p>1: homePort and AVG(guns). 1: the alias. 1: GROUP BY homePort.</p>" },
    ],
  },
  "ddd-testing": {
    title: "Testing SQL",
    questions: [
      { q: "A requirement says \"ships with at least 74 guns\". The query uses <code>guns &gt; 74</code>. What goes wrong?", opts: ["Nothing", "Ships with exactly 74 guns are wrongly left out", "Too many rows are returned", "Syntax error"], a: 1, why: "\"At least\" needs >=. Always test on the boundary." },
      { q: "A three-table query returns far more rows than expected, with every cadet paired with every posting. The most likely cause is…", opts: ["a missing ORDER BY", "a missing join condition in the WHERE clause", "a wrong alias", "too many wildcards"], a: 1, why: "Without the join, every row of one table is combined with every row of another." },
      { q: "Evaluating <b>accuracy of output</b> means checking that…", opts: ["the database has three tables", "the results are correct and complete: the right rows, values and order", "the query runs quickly", "the user likes it"], a: 1, why: "Accuracy of output compares the actual results with the expected results." },
    ],
  },

  /* ---------------- WEB ---------------- */
  "wdd-analysis": {
    title: "Web analysis",
    questions: [
      { q: "Which is the best <b>functional</b> requirement for a website?", opts: ["\"Visitors want to book a camp.\"", "The Events page will have a form with a number input (range 1–4) for places and a submit button.", "The site should look nice.", "Parents use phones."], a: 1, why: "It names the form element and its validation. The 2025 report asks for exactly this technical detail." },
    ],
  },
  "wdd-structure": {
    title: "Site structure",
    questions: [
      { q: "In an SQA site structure diagram, what does a shaded box mean?", opts: ["A page under construction", "A page that is in the horizontal navigation bar", "An external link", "A page with a form"], a: 1, why: "The shaded pages, including Home, appear in the nav bar at the top of every page." },
      { q: "At Higher, what is the most pages allowed at each level below the home page?", opts: ["2", "3", "4", "Unlimited"], a: 2, why: "Home page plus two further levels, with no more than four pages per level." },
      { q: "A vertical line from Flying down to Gliding shows…", opts: ["a two-way link", "a one-way link from Flying down to Gliding", "that Gliding is in the nav bar", "an external link"], a: 1, why: "Vertical lines are one-way links, from top to bottom." },
    ],
  },
  "wdd-design": {
    title: "Wireframes and usability",
    questions: [
      { q: "\"Ewan, 14, a keen gamer who skims text and uses a tablet.\" In usability testing this is a…", opts: ["test case", "scenario", "persona", "wireframe"], a: 2, why: "A persona is a fictional, realistic user that the tester role-plays." },
      { q: "Why test with a low-fidelity prototype?", opts: ["It shows the final colours exactly", "Design problems are found early and cheaply, before money is spent on coding", "Search engines need it", "It replaces compatibility testing"], a: 1, why: "Paper or simple mock-ups are quick to change." },
      { q: "Which of these should a Higher wireframe show?", opts: ["The final hex colour codes", "The positions of the nav bar, media and form inputs, and the media file formats", "The JavaScript code", "The server's IP address"], a: 1, why: "Wireframes show layout: relative positions, nav bar, form inputs and media formats." },
    ],
  },
  "wdd-html": {
    title: "HTML layout",
    questions: [
      { q: "Which element holds the navigation bar's links?", opts: ["&lt;header&gt;", "&lt;nav&gt;", "&lt;footer&gt;", "&lt;section&gt;"], a: 1, why: "&lt;nav&gt; contains the navigation links, usually as a &lt;ul&gt;." },
      { q: "What is special about an <code>id</code> attribute?", opts: ["It can be used on many elements", "It must be unique on the page, so CSS (#id) or JavaScript (getElementById) can target one element", "It sets the font", "It is only for images"], a: 1, why: "A class can be shared. An id identifies exactly one element." },
    ],
  },
  "wdd-css": {
    title: "CSS",
    questions: [
      { q: "<code>header, nav, footer {margin-top:5px}</code> uses a…", opts: ["descendant selector", "grouping selector", "id selector", "inline style"], a: 1, why: "A comma-separated list applies one rule to several elements." },
      { q: "Four floated images are each <code>width:180px; padding:10px; margin:5px</code> (no border), inside an 800px section. What happens?", opts: ["They fit with 80px spare", "They need 840px, so the fourth image drops to a new line", "They overlap", "They shrink to fit"], a: 1, why: "Each takes 180 + 2×10 + 2×5 = 210px. Four need 840px, which is more than 800." },
      { q: "A footer is drawn up beside some floated images. Which declaration fixes it?", opts: ["<code>display:none</code>", "<code>clear:both</code>", "<code>float:left</code>", "<code>padding:0</code>"], a: 1, why: "clear:both makes the footer start below every floated element." },
      { q: "Why is an external stylesheet the most efficient choice for a whole site?", opts: ["It loads faster than HTML", "One file styles every page, so a single change updates the whole site consistently", "It overrides inline styles", "It is required by browsers"], a: 1, why: "There is less repeated code, and it is easier to maintain." },
    ],
  },
  "wdd-forms": {
    title: "Forms",
    questions: [
      { q: "Which attributes make a range check on an age input?", opts: ["<code>maxlength=\"2\"</code>", "<code>required</code>", "<code>type=\"number\" min=\"12\" max=\"17\"</code>", "<code>size=\"5\"</code>"], a: 2, why: "min and max on a number input enforce a range." },
      { q: "Which attribute provides a presence check?", opts: ["<code>required</code>", "<code>value</code>", "<code>checked</code>", "<code>name</code>"], a: 0, why: "required stops the form being submitted while the field is empty." },
      { q: "Three radio buttons should let the user choose only <b>one</b> option. They must…", opts: ["have different names", "share the same name attribute", "each be required", "be inside a select"], a: 1, why: "Radio buttons with the same name form one group." },
    ],
  },
  "wdd-js": {
    title: "JavaScript events",
    questions: [
      { q: "Which event fires when the pointer leaves an element?", opts: ["onclick", "onmouseover", "onmouseout", "onleave"], a: 2, why: "onmouseout fires when the pointer moves off the element." },
      { q: "In <code>onmouseover=\"this.style.width='150px'\"</code>, what is <code>this</code>?", opts: ["The whole page", "The element that has the event", "The next image", "A CSS class"], a: 1, why: "this refers to the element containing the event attribute." },
      { q: "Which line hides the element with id \"orders\"?", opts: ["<code>document.getElementById(\"orders\").style.display=\"none\"</code>", "<code>this.style.display=\"block\"</code>", "<code>orders.hide()</code>", "<code>display:none(orders)</code>"], a: 0, why: "Find the element by id, then set its CSS display to none." },
    ],
  },
  "wdd-testing": {
    title: "Web testing",
    questions: [
      { q: "Testing a site on a smartphone, a tablet and a desktop is…", opts: ["usability testing", "compatibility testing (device type)", "input validation", "a persona"], a: 1, why: "Compatibility testing checks the site works across device types and browsers." },
      { q: "What is an orphan page?", opts: ["A page with no images", "A page that no other page links to", "The home page", "A page in the nav bar"], a: 1, why: "If nothing links to it, users can't reach it. Link testing should find it." },
      { q: "Evaluating a site's <b>fitness for purpose</b> means checking that…", opts: ["it meets all the end-user and functional requirements", "it uses the latest HTML", "it has no CSS", "it loads in one second"], a: 0, why: "Fitness for purpose is measured against the requirements." },
    ],
  },

  /* ---------------- EXAM ---------------- */
  "exam-commands": {
    title: "Command words",
    questions: [
      { q: "A question says <b>explain</b>. What must your answer include that a <b>describe</b> answer need not?", opts: ["A diagram", "A reason or consequence: why or how", "Code", "Exactly one word"], a: 1, why: "Explain = why or how, so link a cause to an effect with \"because\" or \"so\"." },
      { q: "Which answer properly <b>compares</b> bit-mapped and vector graphics on scaling?", opts: ["\"Vector graphics scale well.\"", "\"Bit-mapped graphics become pixelated when enlarged, whereas vector graphics are resolution independent and stay sharp.\"", "\"Both are graphics.\"", "\"Bit-mapped is better.\""], a: 1, why: "Both items, the same point, linked by \"whereas\"." },
    ],
  },
  "exam-mock-sdd": {
    title: "Mock: software",
    questions: [
      { type: "open", q: "A program stores the names and lap times of 20 rowers in an array of records called <code>crew</code>. Using a design technique, show the refinement of a sub-program that finds and displays the name of the rower with the <b>fastest</b> (lowest) time.", marks: 4, model: "<pre>1 set minPos to 0\n2 loop from position 1 to 19\n3     if crew(position).time &lt; crew(minPos).time then\n4         set minPos to position\n5     end if\n6 end loop\n7 display crew(minPos).name</pre><p>1: initialise using the first element (not 0 or a guess). 1: a loop over the remaining elements. 1: compare with &lt; on the time field. 1: update the position, then display the name using it.</p>" },
      { type: "open", q: "The program above is tested with times where two rowers tie for fastest. Explain which name is displayed, and why.", marks: 2, model: "<p>The <b>first</b> rower in the array with the fastest time is displayed. (1) The condition uses a strict &lt;, so a later equal time does not replace the stored position. (1)</p>" },
      { type: "open", q: "Explain one way the program's <b>maintainability</b> could be improved.", marks: 1, model: "<p>Any one, linked to the code: split it into sub-programs with parameters, so each part can be changed separately; use meaningful identifiers such as <code>minPos</code> rather than <code>x</code>; add internal commentary explaining the algorithm; use a constant for the number of rowers, so a crew-size change needs only one edit.</p>" },
    ],
  },
  "exam-mock-context": {
    title: "Mock: a full context question",
    questions: [
      { type: "open", q: "<b>Context.</b> The squadron's quartermaster stores, in parallel arrays, the <code>item</code> names and the <code>stock</code> levels of 40 items of kit, read from <code>kit.csv</code>.<br><br><b>(a)</b> Identify two functional requirements for a program that reads the file and displays the names of all items with fewer than 5 in stock.", marks: 2, model: "<ul><li>Input: read the item names and stock levels from kit.csv. (1)</li><li>Process/output: check each stock level and display the name of every item with a stock below 5. (1)</li></ul>" },
      { type: "open", q: "<b>(b)</b> Using a design technique, show the data flow for two sub-programs: <code>readKit</code> and <code>showLowStock</code>.", marks: 2, model: "<ul><li>readKit: OUT item(), stock(). (1)</li><li>showLowStock: IN item(), stock(), and nothing OUT, because it only displays. (1)</li></ul>" },
      { type: "open", q: "<b>(c)</b> Write the code for <code>showLowStock</code>.", marks: 3, model: "<pre>def show_low_stock(item, stock):\n    for index in range(len(stock)):\n        if stock[index] &lt; 5:\n            print(item[index])</pre><ul><li>A loop over every element. (1)</li><li>The correct condition, stock[index] &lt; 5. (1)</li><li>Displays item[index], the parallel array at the same index. (1)</li></ul>" },
      { type: "open", q: "<b>(d)</b> The program is tested with stock levels of 4, 5 and 6. Explain what this test data shows, and name its type.", marks: 2, model: "<ul><li>These are <b>normal</b> test data chosen either side of, and on, the threshold of 5. They are not extreme data: the input has no valid range here, so there are no extreme values to test. (1)</li><li>4 should be displayed, but 5 and 6 should not. This shows the condition uses &lt; and not &lt;=, which checks the boundary is handled correctly. (1)</li></ul>" },
      { type: "open", q: "<b>(e)</b> Evaluate the <b>efficiency</b> of the program's use of coding constructs.", marks: 2, model: "<ul><li>One fixed loop visits each item exactly once, and every item must be checked, so a fixed loop is appropriate. (1)</li><li>The file reading and the display are separate sub-programs with parameter passing, so the code isn't repeated and the arrays are passed rather than held as globals. (1)</li></ul>" },
    ],
  },
  "exam-mock-cs": {
    title: "Mock: systems",
    questions: [
      { type: "open", q: "A sensor stores temperatures as 8-bit two's complement. (a) State the lowest temperature it can store. (b) Show how −17 is stored.", marks: 3, model: "<p>(a) −128 (1)</p><p>(b) 17 = 00010001 → invert 11101110 → add 1 = <b>11101111</b> (2: one for the method, one for the correct answer). Check: −128 + 64 + 32 + 8 + 4 + 2 + 1 = −17.</p>" },
      { type: "open", q: "An online shop's website is hit by a DoS attack. (a) Describe one <b>effect</b> on its users and one on the business. (b) State two <b>costs</b> to the business.", marks: 4, model: "<p>(a) Effects:</p><ul><li>Users: customers can't reach the site (or it is very slow), so they can't browse or buy. (1)</li><li>Business: it is disrupted and can't trade or serve its customers online. (1)</li></ul><p>(b) Costs:</p><ul><li>Lost revenue from sales that couldn't be made. (1)</li><li>The cost of the labour needed to investigate and fix the fault. (1)</li></ul><p>SQA keeps these headings separate: effects are disruption; costs are lost revenue and labour.</p>" },
      { type: "open", q: "The shop's site uses HTTPS. Explain how a digital certificate helps a customer trust it.", marks: 2, model: "<ul><li>The certificate is issued and signed by a trusted Certificate Authority, and links the shop's identity (its domain name) to its public key. (1)</li><li>The browser checks the CA's signature, the name and the expiry date before encrypting data with that public key, so the customer knows they are talking to the genuine shop and not an impostor. (1)</li></ul>" },
    ],
  },
  "exam-mock-ddd": {
    title: "Mock: database",
    questions: [
      { type: "open", q: "Using the squadron database, write SQL to display the shipName and the total number of nights booked on each ship, for ships based in Portsmouth, with a readable heading for the total.", marks: 4, model: "<pre>SELECT shipName, SUM(nights) AS [Total nights]\nFROM Ship, Posting\nWHERE Ship.shipCode = Posting.shipCode\n  AND homePort = \"Portsmouth\"\nGROUP BY shipName;</pre><p>1: the fields with SUM(nights) and an alias. 1: both tables and the join. 1: the Portsmouth criterion. 1: GROUP BY shipName.</p>" },
      { type: "open", q: "The squadron also wants to record which <b>instructors</b> run each posting, and an instructor can run many postings, which can each have several instructors. Explain the change needed to the database design.", marks: 2, model: "<ul><li>Instructor and Posting would have a <b>many-to-many</b> relationship, which can't be implemented directly. (1)</li><li>Add a new linking entity (e.g. <i>Supervision</i>) holding instructorID* and the posting's key (cadetID* + shipCode*) as foreign keys, giving two one-to-many relationships. (1)</li></ul>" },
    ],
  },
  "exam-mock-wdd": {
    title: "Mock: web",
    questions: [
      { type: "open", q: "Write HTML for a form input that accepts the number of camp places (1 to 4) and must not be left blank.", marks: 2, model: "<pre>&lt;input type=\"number\" name=\"places\" min=\"1\" max=\"4\" required&gt;</pre><p>1: number type with min and max (range check). 1: required (presence check).</p>" },
      { type: "open", q: "A page's images should sit side by side as on the wireframe, but the last one appears on a new line. The CSS is <code>section {width:600px} img {float:left; width:140px; margin:10px}</code> with four images. Explain the problem and give a fix.", marks: 2, model: "<ul><li>Each image takes 140 + 10 + 10 = 160px, and four take 640px, which is more than the 600px section, so the fourth wraps onto a new line. (1)</li><li>Reduce the margin to 5px (4 × 150 = 600), or the width to 130px, so all four fit and match the wireframe. (1)</li></ul>" },
      { type: "open", q: "Write the JavaScript for an image that shows the paragraph with id \"tip\" (initially hidden) when it is clicked.", marks: 2, model: "<pre>&lt;img src=\"help.png\" onclick=\"document.getElementById('tip').style.display='block'\"&gt;</pre><p>1: an onclick event on the image. 1: getElementById('tip') with style.display set to block.</p>" },
    ],
  },
};
