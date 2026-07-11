// ============================================================================
// Brilliancy — the script.
//
// Rounds I–VII are real games, replayed move for move; the movetext here is
// machine-verified against the engine (tests/scenes.test.mjs), and the key
// positions were independently cross-checked against published sources.
// Round VIII is ours alone: an engine-PROVEN forced mate (every PROMETHEUS
// reply in the scripted line is its only legal move, or is refuted by a
// short mate the test suite searches out).
//
// Beat keys are 0-based ply indices into `line`.
//   moment  — the instinct menu, then the player makes the move on the board
//   combo   — pre-glowed click-through (until: last combo ply)
//   auto    — everything else; say/after/eval/stamp/think decorate it
//   montageTo / techniqueTo — compress connective play; preludeTo compresses
//   the opening the same way.
// ============================================================================

export const META = {
  event: "The Vosskerry Winter Invitational",
  venue: "The Long Hall, Vosskerry — by the North Sea",
  titleText: [
    "You do not play chess. You have never played chess. You are fairly sure the horse does something sideways.",
    "Tonight, none of that will matter. Tonight the seat at board one is empty, the sea wind is rattling the high windows, and something very old and very fond of chess has decided that you, of all people, will do nicely.",
  ],
  titleFoot: "Sound is worth having. Nothing here needs knowledge — only nerve.",
  sevenNote:
    "Seven rounds, seven wins. The arbiter notes, for the record, that the last perfect score anyone can name was Fischer's 11–0 — and he, at least, knew the rules.",
  revealFoot:
    "Round Eight appears in no database. We checked. PROMETHEUS checked. PROMETHEUS is still checking.",
  certHead: "The Vosskerry Brilliancy Prize · awarded this night, by acclamation",
  certName: "The Stranger at Board One",
  certBody:
    "who does not play chess, and who played, this night, the finest chess ever recorded. Seven immortal games, and an eighth the immortals had not thought of yet.",
  certFoot: "Caïssa regrets nothing.",
  certSig: "— (signature illegible. It always is.)",
};

// Round-robin bookkeeping: 8 seats, Berger tables, you are seat 8 (index 7).
const SCHEDULE = [
  [[0, 7], [1, 6], [2, 5], [3, 4]],
  [[7, 4], [5, 3], [6, 2], [0, 1]],
  [[1, 7], [2, 0], [3, 6], [4, 5]],
  [[7, 5], [6, 4], [0, 3], [1, 2]],
  [[2, 7], [3, 1], [4, 0], [5, 6]],
  [[7, 6], [0, 5], [1, 4], [2, 3]],
  [[3, 7], [4, 2], [5, 1], [6, 0]],
];
export const CROSSTABLE = {
  seats: [
    "Fitz-Hardenberg & Pinch", "Kroy", "Sandoval-Quist", "Ganz",
    "Brem", "Feld", "Halvorsen", "You",
  ],
  result(i, j, roundsDone) {
    for (let r = 0; r < SCHEDULE.length; r++) {
      for (const [a, b] of SCHEDULE[r]) {
        if ((a === i && b === j) || (a === j && b === i)) {
          if (r >= roundsDone) return null;
          if (i === 7) return 1;
          if (j === 7) return 0;
          // Sister Ingrid (seat 6) draws everything she is allowed to draw.
          if (i === 6 || j === 6) return 0.5;
          const lo = Math.min(i, j), hi = Math.max(i, j);
          const v = (lo * 3 + hi * 5 + r) % 4;
          const loWins = v === 0 ? 1 : v === 1 ? 0 : 0.5;
          return i === lo ? loWins : v > 1 ? 0.5 : 1 - loWins;
        }
      }
    }
    return null;
  },
};

export const DEFAULT_NUDGES = [
  "Your fingers hover — hover, never touch. The room leans in.",
  "Not that square. You know it is not that square. Even the square knows.",
  "Somewhere in row three, a man stops chewing.",
];

export const SCENES = [

  // ══════════════════════════════════════════════════════════════ ROUND I ══
  {
    id: "opera",
    round: 1, roundLabel: "I", youAre: "w",
    title: "The Consultation",
    opponent: {
      name: "Archduke Leopold Fitz-Hardenberg & Mr Pinch",
      sub: "playing as a committee",
      rating: 2380, ratingLabel: "combined, allegedly, 2380",
      glyph: "⚜",
      bio: "An archduke and his solicitor, consulting on every move. They whisper. They disagree. Each is keeping notes for the inquiry.",
    },
    youRatingBefore: "Unrated", youRatingAfter: 2210,
    intro: [
      "The Long Hall smells of beeswax and cold sea air. Seven boards, seven games, and at board one: two men, one chair each, sharing a single set of convictions between them.",
      "You sit. You reach for the white pieces because they are nearer. The room decides this was a statement of intent.",
    ],
    arbiterNote: "The arbiter reminds spectators that applause is customarily reserved for the end of the game. The arbiter will be ignored.",
    clockSecs: 5400,
    line: "1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8#",
    finalFen: "1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17",
    preludeTo: 18,
    opening: "Philidor Defence",
    oldStyle: ["P-K4", "P-K4", "N-KB3", "P-Q3", "P-Q4", "B-KN5"],
    oldStyleNote: "…the scorer opens the book in the old style —",
    oldStyleAfter: "…and, weeping quietly, switches to algebraic.",
    onSit: [
      ["room", "The Archduke adjusts his cuffs. Mr Pinch adjusts the Archduke."],
      ["cass", "Good evening from the Long Hall! Casimir Zublev, alongside the incomparable Dr Miranda Ply, and at board one — well, nobody seems to know WHO at board one. I love it already."],
      ["ply", "Engine baseline: equal. For non-players: the bar beside the board is what the machine thinks. Up is good for our stranger. It has not moved in nine moves."],
    ],
    montageDrift: {
      6: ["room", "The consultation trades in the middle. Pinch wanted a second opinion. There were already two."],
      13: ["cass", "Development, development — they're playing like the book, and our stranger is playing like the person the book was ABOUT."],
    },
    crystallize: [
      ["room", "The hall settles. Something on the queenside has come loose."],
    ],
    nudges: [
      "J'adoube, you murmur — only straightening it. The room exhales. Nobody believes you were only straightening it.",
      "Your hand drifts wide, hovers — a feint. The Archduke reaches for his water.",
      "Not that one. The other one has been waiting all evening.",
    ],
    beats: {
      18: {
        type: "moment",
        prompt: "Their pawn has stepped forward to shoo your bishop away. Both of them look rather pleased about it.",
        instincts: [
          { text: "Retreat the bishop — it is attacked.", sub: "safe. sensible.", refusal: "Your hand declines, the way one declines a second sherry. (The machine later confirms retreat also wins. But not like this.)" },
          { text: "The knight does not count pawns. Take the pawn that dared.", destiny: true },
          { text: "Castle first. Tidy up. Be reasonable.", refusal: "Reasonable. Yes. Your hand has begun composing its apology to reasonableness." },
        ],
        stamp: "!", eval: 1.4,
        after: [
          ["cass", "He's LEFT the knight! Taken with the knight! Given the knight?! Miranda, what is happening—"],
          ["ply", "A piece for two pawns and the c-file. The machine calls it unsound. The machine's voice wavered slightly."],
        ],
      },
      19: { pace: 700 },
      20: { eval: 2.0, after: [["ply", "Check. The consultation blocks with the knight. They had five defences. They chose the one the textbooks were written to prevent."]] },
      22: {
        say: [["cass", "Castles — LONG! The king strolls one way, the rook arrives like a bailiff!"]],
        eval: 2.4,
      },
      23: { think: 130, thinkMs: 2400, after: [["room", "Pinch suggests a wall. The Archduke builds it. It is a very small wall."]] },
      24: {
        type: "moment",
        prompt: "Their knight hides behind a hired rook. Somewhere behind that, a king is pretending to be furniture.",
        instincts: [
          { text: "Take the little knight with the rook — pay iron for horseflesh.", destiny: true },
          { text: "Bring the other rook first. Build. Accumulate.", refusal: "Sound. Solid. The chess equivalent of beige. Your hand is already elsewhere." },
          { text: "Take the little knight with the bishop — the civilised way, with check.", refusal: "The bishop could do it — politely, and the attack goes home at a reasonable hour. Your hand despises reasonable hours." },
        ],
        slow: true, stamp: "!!", eval: 3.4,
        after: [
          ["cass", "THE ROOK GOES IN! The exchange, sacrificed on d7 like it was change for the cloakroom!"],
          ["ply", "Material: they are ahead. Coordinates: they are already dead. These facts will take four moves to introduce themselves to each other."],
        ],
      },
      26: { say: [["cass", "And the OTHER rook. Of course. There was never a plan B — there wasn't even a plan A, there was just a verdict."]], eval: 4.2 },
      27: { think: 210, thinkMs: 3000, after: [["room", "The Archduke's queen tiptoes to e6, guarding everything except what matters."]] },
      28: { eval: 5.2, after: [["ply", "Bishop takes, check. Piece count update for the non-players: irrelevant. It has been irrelevant since the sherry remark."]] },
      30: {
        type: "moment",
        prompt: "One of their knights guards the front door. Nothing guards the idea.",
        instincts: [
          { text: "Trade queens. Simplify. Go home. Sleep.", refusal: "(The machine later showed this also wins. In 41 moves. You are not here for 41 moves.)" },
          { text: "The queen wants to die on a white square, in front of everyone.", sub: "she has wanted it all evening", destiny: true },
          { text: "Take the knight with the rook — trade, tidy, no theatrics.", refusal: "Your hand pauses over the rook — and moves on. The rook has a different appointment." },
        ],
        slow: true, stamp: "!!", eval: 9.0,
        after: [
          ["cass", "QUEEN B8!!! TAKEN — IT MUST BE TAKEN — THE KNIGHT MUST TAKE—"],
          ["ply", "It must. It is the only legal reply. I have rerun this three times because I did not trust my own eyes, and my eyes are digital."],
        ],
      },
      31: { pace: 1200, after: [["room", "For one heartbeat, the Archduke believes he has won a queen. It is a lovely heartbeat. It is his last."]] },
      32: {
        type: "combo", until: 32, silence: true,
        lines: ["Mate."],
        wind: [["cass", "and now— oh, you can hear it, the whole hall can hear it coming—"]],
      },
    },
    outcome: {
      kind: "mate",
      ritual: [
        ["pause", 900],
        ["room", "Silence. Then the person in row three who had stopped chewing starts applauding, and the hall comes down."],
        ["say", "ply", "Rook to d8. Mate. Seventeen moves. For the record, the previous fastest win in this hall was twenty-eight, and the winner cried."],
        ["pause", 700],
        ["room", "The Archduke reaches for his king. Mr Pinch reaches for the king. A brief, whispered dispute over who has the AUTHORITY to resign—"],
        ["tip"],
        ["say", "room", "— resolved. Mr Pinch is taking notes for the lawsuit. Against whom is not yet clear."],
      ],
      say: [
        ["cass", "Seventeen moves! A queen sacrificed on an empty square and a mate delivered like a hand-addressed envelope! WHO IS THIS?"],
        ["ply", "Unknown. Unrated. The federation is being telephoned. The federation believes it is a prank call."],
      ],
      headlines: [
        { style: "broadsheet", src: "The Vosskerry Intelligencer, morning edition", text: "MYSTERY GENTLEPERSON DISMANTLES ARCHDUKE & SOLICITOR IN SEVENTEEN MOVES; SOLICITOR UNDERSTOOD TO BE PREPARING PROCEEDINGS AGAINST OWN KING" },
        { style: "broadsheet", src: "letters, p.14", text: "SIR — Regarding the queen sacrifice at board one: I was present, and I shall be dining on this fact for the remainder of my natural life." },
      ],
    },
    reveal: {
      place: "Paris", year: 1858,
      players: "Paul Morphy against the Duke of Brunswick and Count Isouard, in a box at the Opera.",
      note: "Played during the interval of a Norma the Duke had seen forty times. You played it move for move.",
    },
  },

  // ═════════════════════════════════════════════════════════════ ROUND II ══
  {
    id: "rubinstein",
    round: 2, roundLabel: "II", youAre: "b",
    title: "The Accountant",
    opponent: {
      name: "Anatol “The Accountant” Brem",
      sub: "counts material twice, happiness never",
      rating: 2510, glyph: "Σ",
      bio: "Keeps a leather ledger beside the board and enters every capture in double columns. Has never once been in debt over the board. Tonight the ledger meets poetry.",
    },
    youRatingBefore: 2210, youRatingAfter: 2495,
    intro: [
      "Overnight, someone rated you. The number is described by the federation as 'provisional', by the papers as 'insulting', and by you as 'a number'.",
      "Herr Brem arrives with a ledger, a spare ledger, and the small confident smile of a man who has never given anything away in his life.",
    ],
    clockSecs: 5400,
    line: "1.d4 d5 2.Nf3 e6 3.e3 c5 4.c4 Nc6 5.Nc3 Nf6 6.dxc5 Bxc5 7.a3 a6 8.b4 Bd6 9.Bb2 O-O 10.Qd2 Qe7 11.Bd3 dxc4 12.Bxc4 b5 13.Bd3 Rd8 14.Qe2 Bb7 15.O-O Ne5 16.Nxe5 Bxe5 17.f4 Bc7 18.e4 Rac8 19.e5 Bb6+ 20.Kh1 Ng4 21.Be4 Qh4 22.g3 Rxc3 23.gxh4 Rd2 24.Qxd2 Bxe4+ 25.Qg2 Rh3",
    finalFen: "6k1/5ppp/pb2p3/1p2P3/1P2bPnP/P6r/1B4QP/R4R1K w - - 2 26",
    preludeTo: 41,
    onSit: [
      ["room", "Herr Brem opens the ledger. Rules a line. Dates it."],
      ["cass", "Round two! Our stranger has the black pieces tonight, which the pundits say is a disadvantage. The pundits also said yesterday that an archduke couldn't lose to an unrated walk-in, so."],
      ["ply", "Engine baseline: equal, fractionally pleasant for White. PROMETHEUS — my desk engine, three cabinets and a coolant complaint — sees nothing unusual coming. I mention this now for later."],
    ],
    montageDrift: {
      16: ["room", "Brem enters a pawn in the credit column. He underlines it."],
      30: ["cass", "Notice the stranger's pieces — all of them looking at the same corner. Like gulls before weather."],
      38: ["ply", "White's attack arrives on schedule. So does the weather."],
    },
    crystallize: [
      ["room", "The position crystallizes. Every black piece is aimed at the king's roof."],
    ],
    beats: {
      41: {
        say: [["cass", "The queen swings out — h4! Right, for the non-players: the stranger's queen is now glaring at White's king from a rooftop across the street."]],
        eval: 0.6,
      },
      42: {
        think: 240, thinkMs: 3200,
        after: [
          ["ply", "g3. Brem defends the mate and attacks the queen. Ledger balanced — he wins a queen next move. PROMETHEUS agrees, briefly."],
        ],
      },
      43: {
        type: "moment",
        prompt: "Your queen is attacked. Everyone in the hall can see the thread she hangs by. Your hand is not looking at the queen.",
        instincts: [
          { text: "Save the queen. Obviously. She is the queen.", refusal: "Your hand drums twice on the table and does not move. Obviously, it agrees. Obviously." },
          { text: "The rook goes into the knight like a bill through a letterbox.", destiny: true },
          { text: "Retreat everything. Consolidate. Breathe.", refusal: "Your hand was caught, just now, hovering over the rook before you finished reading this option. It apologises for nothing." },
        ],
        slow: true, stamp: "!!", evalFlicker: -1.2, eval: 2.4,
        after: [
          ["cass", "ROOK TAKES ON c3 — AND THE QUEEN IS STILL HANGING! He's ignored the — she's just STANDING there—"],
          ["ply", "Queen still en prise. Rook freshly en prise. Herr Brem's pen has stopped moving, which for Herr Brem is a scream."],
        ],
      },
      44: {
        pace: 1600,
        after: [["room", "Brem takes the queen. Enters her in the ledger. His handwriting has acquired a tremor in the descenders."]],
      },
      45: {
        type: "moment",
        prompt: "He has your queen. He is still smiling. There is an empty square deep in his house, and your other rook has been staring at it for some time.",
        instincts: [
          { text: "The second rook follows the first. Through the door. No knocking.", destiny: true },
          { text: "Take something back — the knight is right there.", refusal: "Even exchange, fair value. Your hand has read Brem's ledger. Your hand did not care for it." },
        ],
        slow: true, stamp: "!!", eval: 5.0,
        after: [
          ["cass", "BOTH rooks! A queen and now BOTH ROOKS on offer — Miranda, I have seen gamblers, I have BEEN gamblers—"],
          ["ply", "He must take the second rook too; declining loses the queen back with interest. Brem knows this. You can see him knowing it."],
        ],
      },
      47: {
        stamp: "!", eval: 7.2,
        after: [["ply", "Bishop takes, check — and there it is. The two bishops cross like scissor blades, and everything White owns is inside the scissors."]],
      },
      48: { pace: 1300, after: [["room", "The queen blocks. It is not a block. It is a last request."]] },
      49: {
        type: "moment",
        prompt: "Nothing of yours is attacked. Nothing of his is defended. There is one square left in the story.",
        instincts: [
          { text: "Rook to the empty corner square. Quietly. Ask for nothing.", destiny: true },
          { text: "Take the queen — she is pinned to the king like a note to a door.", refusal: "She isn't going anywhere. Your hand prefers the version they will print." },
        ],
        stamp: "!!", eval: 9.8,
        after: [
          ["cass", "Rook h3!! It cannot be taken — the pawn that would take it LEFT, it's on h4, it went shopping — and mate on h2 cannot be stopped—"],
          ["ply", "Confirmed. The g-pawn is gone, the queen is pinned, the ceiling falls at leisure. PROMETHEUS annotates the last five black moves: !!, !!, +, and !!. It does not usually use punctuation."],
        ],
      },
    },
    outcome: {
      kind: "resign",
      ritual: [
        ["pause", 800],
        ["room", "Herr Brem studies the board. Studies the ledger. The columns no longer agree, and the ledger has never lied to him before."],
        ["say", "ply", "Material count: he is ahead a queen and a rook, for a bishop and a knight. Position count: mate next move. He writes one line."],
        ["room", "TOTAL: —. He closes the ledger."],
        ["tip"],
      ],
      say: [
        ["cass", "He's resigned — a queen up, he's resigned, and he's RIGHT to! The stranger gave away the two biggest things on the board and kept the two that mattered!"],
        ["ply", "The bishops. For the non-players: the two quiet diagonal ones. Tonight they were neither."],
      ],
      headlines: [
        { style: "broadsheet", src: "The Vosskerry Intelligencer", text: "STRANGER PAYS QUEEN, TWO ROOKS FOR ENTIRE KINGDOM; ACCOUNTANT DECLARES SELF INSOLVENT, GAME 'IMMORTAL'" },
        { style: "broadsheet", src: "commercial notices", text: "BREM & SONS ACTUARIAL — CLOSED THURSDAY FOR STOCKTAKING OF PERSONAL BELIEFS" },
      ],
    },
    reveal: {
      place: "Łódź", year: 1907,
      players: "Akiba Rubinstein against Gersz Rotlewi — Rubinstein's Immortal.",
      note: "The queen and both rooks, given for a mating net history is still diagramming. You played it move for move.",
    },
  },

  // ════════════════════════════════════════════════════════════ ROUND III ══
  {
    id: "marshall",
    round: 3, roundLabel: "III", youAre: "b",
    title: "The Coffeehouse King",
    opponent: {
      name: "“Gold-Tooth” Vasily Kroy",
      sub: "seven rings, none of them his",
      rating: 2485, glyph: "¤",
      bio: "Learned chess for money in establishments where the loser also paid for the table. Bites coins to check them. Has never trusted a quiet move in his life, on excellent historical grounds.",
    },
    youRatingBefore: 2495, youRatingAfter: 2640,
    intro: [
      "Kroy shakes your hand warmly and checks his rings afterwards, out of habit.",
      "Before the round, Dr Ply tells the radio audience an old story: that once, long ago, a move was played so beautiful that the spectators showered the board with gold pieces. 'The historians doubt it,' she says. 'Legends are sometimes rehearsals.'",
    ],
    clockSecs: 5400,
    line: "1.d4 e6 2.e4 d5 3.Nc3 c5 4.Nf3 Nc6 5.exd5 exd5 6.Be2 Nf6 7.O-O Be7 8.Bg5 O-O 9.dxc5 Be6 10.Nd4 Bxc5 11.Nxe6 fxe6 12.Bg4 Qd6 13.Bh3 Rae8 14.Qd2 Bb4 15.Bxf6 Rxf6 16.Rad1 Qc5 17.Qe2 Bxc3 18.bxc3 Qxc3 19.Rxd5 Nd4 20.Qh5 Ref8 21.Re5 Rh6 22.Qg5 Rxh3 23.Rc5 Qg3",
    finalFen: "5rk1/pp4pp/4p3/2R3Q1/3n4/6qr/P1P2PPP/5RK1 w - - 2 24",
    preludeTo: 37,
    onSit: [
      ["room", "Kroy spins a coin. Catches it without looking. The coin is for later; he does not know this yet."],
      ["cass", "Round three, and the hall is FULL. There are people standing behind people who are standing."],
      ["ply", "White gets a lively position from the opening and Kroy plays it the coffeehouse way: everything forward, receipts afterwards."],
    ],
    montageDrift: {
      20: ["room", "Kroy hums as he takes a pawn. The hum is a habit from rooms where you counted your winnings by ear."],
      33: ["cass", "The stranger's pieces keep arriving at ODD angles — like furniture moved by someone who can see in the dark."],
    },
    crystallize: [
      ["room", "Everything hangs. Both kings pretend not to notice."],
    ],
    beats: {
      37: {
        type: "moment",
        prompt: "His rook has barged into the middle of your house and is eating at your table. Your knight — a small thing on the rim — clears its throat.",
        instincts: [
          { text: "Evict the rook. It's in YOUR house.", refusal: "The rook is bait on a hook on a line held by a man with seven rings. Your hand has met such men." },
          { text: "The knight hops to the well square, where all his pieces must walk past it.", destiny: true },
        ],
        stamp: "!", eval: 0.8,
        after: [["ply", "Knight to d4. It attacks nothing in particular, which is to say it attacks the future in general."]],
      },
      38: { pace: 1200 },
      40: { say: [["cass", "Kroy lifts a rook UP THE MIDDLE — carriage-and-four stuff, straight at the king!"]] },
      41: { after: [["room", "Your rook shuffles sideways to h6 like a stagehand taking position before the interval."]], eval: 0.9 },
      43: {
        stamp: "!", eval: 1.6,
        after: [["ply", "Rook takes the bishop on h3. Kroy declines to recapture — the g-pawn taking would open his king's roof in a gale. He attacks the queen instead. This is the correct decision for one more move."]],
      },
      44: {
        think: 320, thinkMs: 3400,
        after: [
          ["cass", "There it is — rook c5, the queen is ATTACKED, Miranda — and the rook on h3 ALSO hangs — the stranger's whole army is standing in traffic—"],
          ["ply", "Queen and rook, both en prise. PROMETHEUS suggests retreating the queen with a small, safe minus. PROMETHEUS is about to have an experience."],
        ],
      },
      45: {
        type: "moment",
        prompt: "The queen is attacked. Every safe square is grey and sensible and far from here. There is one square that is none of those things — deep in his camp, defended three times, radiant.",
        instincts: [
          { text: "Pull the queen back to safety. Live to fight.", refusal: "Your hand does not move. Some moves are merely correct. The hand is holding out for the other kind." },
          { text: "The queen walks into the fire — the one square three of his men can take her: two pawns, and his own queen.", sub: "she wants to REIGN there", destiny: true },
          { text: "Save the hanging rook at least. Limit the bleeding.", refusal: "(No. The bleeding is his. It merely hasn't reached the ledger yet.)" },
        ],
        slow: true, stamp: "!!", eval: 10,
        after: [
          ["cass", "THE QUEEN IS EN PRISE! SHE HAS BEEN EN PRISE FOR THE LENGTH OF A HELD BREATH AND NOBODY HAS TOLD HER! QUEEN — G — THREE!!"],
          ["ply", "Three captures on offer. If the h-pawn takes: knight arrives, mate. If the f-pawn takes: knight arrives with check, rook mates. If the QUEEN takes: knight fork, and the arithmetic ends. I have re-run this. Evaluation is very calm about it. I am reporting the calm."],
          ["room", "Kroy checks the queen with a bitten coin, as if she might be counterfeit. She is not counterfeit."],
        ],
      },
    },
    outcome: {
      kind: "resign",
      coins: true,
      ritual: [
        ["pause", 1000],
        ["say", "cass", "He's seen it. He's seen all three of them. Vasily Kroy is smiling like a man reading his own eulogy and finding it fair."],
        ["tip"],
        ["pause", 400],
        ["coins"],
        ["say", "room", "It begins with one coin from the back of the hall — then the legend comes true all at once, gold ringing off the walnut like weather."],
        ["say", "room", "Kroy pockets two of the coins from the board. 'Table fee,' he says. Nobody argues."],
      ],
      say: [
        ["ply", "For the record: the legend of the gold coins is disputed by historians. The historians are not here tonight."],
      ],
      headlines: [
        { style: "tabloid", src: "The Evening Bellows", text: "GOLD RAINS INDOORS AS QUEEN WALKS INTO THREE-WAY DEATH AND WINS" },
        { style: "tabloid", src: "The Evening Bellows, p.2", text: "COFFEEHOUSE KING PAYS TABLE FEE FROM PRIZE WEATHER — 'FAIREST MUGGING OF MY CAREER'" },
      ],
    },
    reveal: {
      place: "Breslau", year: 1912,
      players: "Frank Marshall against Stefan Levitsky — the gold coins game.",
      note: "Queen to g3, capturable three ways, all losing. The coins may be legend. Tonight they were real. Move for move.",
    },
  },

  // ═════════════════════════════════════════════════════════════ ROUND IV ══
  {
    id: "zugzwang",
    round: 4, roundLabel: "IV", youAre: "b",
    title: "The Prophylactic",
    opponent: {
      name: "Dr Erasmus Feld",
      sub: "author of 'The Unmoved Mover' (3 vols)",
      rating: 2530, glyph: "Ø",
      bio: "Believes chess is a conversation won by not talking. Has not made a committal move since 1989. His last book proved, in three volumes, that the best move is usually no move at all. Tonight the universe agrees with him more literally than he would like.",
    },
    youRatingBefore: 2640, youRatingAfter: 2731,
    intro: [
      "Dr Feld does not shake hands; he inclines his head one degree, conserving the tempo.",
      "'Watch this one carefully,' Dr Ply tells the radio audience. 'Nothing will appear to happen. Then nothing will happen. Then nothing will be able to happen — to him. There is a word for that, and it is the most beautiful word we have.'",
    ],
    clockSecs: 5400,
    line: "1.d4 Nf6 2.c4 e6 3.Nf3 b6 4.g3 Bb7 5.Bg2 Be7 6.Nc3 O-O 7.O-O d5 8.Ne5 c6 9.cxd5 cxd5 10.Bf4 a6 11.Rc1 b5 12.Qb3 Nc6 13.Nxc6 Bxc6 14.h3 Qd7 15.Kh2 Nh5 16.Bd2 f5 17.Qd1 b4 18.Nb1 Bb5 19.Rg1 Bd6 20.e4 fxe4 21.Qxh5 Rxf2 22.Qg5 Raf8 23.Kh1 R8f5 24.Qe3 Bd3 25.Rce1 h6",
    finalFen: "6k1/3q2p1/p2bp2p/3p1r2/1p1Pp3/3bQ1PP/PP1B1rB1/1N2R1RK w - - 0 26",
    preludeTo: 30,
    onSit: [
      ["room", "Feld arranges his pieces a quarter-millimetre truer. J'adoube, he says, to no one. It is the most he will say all night."],
      ["cass", "Round four. Our stranger against the great refuser himself. Somebody is going to have to DO something, Miranda."],
      ["ply", "Statistically, no."],
    ],
    montageDrift: {
      8: ["room", "Feld deploys his pieces to squares of proven innocence."],
      33: ["cass", "The stranger gives up a knight for — for nothing? For air? Miranda, the machine, what does the machine say—"],
      39: ["ply", "PROMETHEUS: the knight cannot be saved. White will be up a full piece, and winning. It also reports, in a smaller font, that every White piece is now facing the wrong way."],
    },
    beats: {
      30: {
        montageTo: 40,
        say: [["room", "The middlegame folds itself slowly, like a letter."]],
      },
      40: {
        pace: 1400, eval: -2.1,
        after: [
          ["ply", "Feld collects the knight. The bar dips against our stranger — a full piece is a full piece. PROMETHEUS is satisfied with White. Keep an eye on the smaller font."],
        ],
      },
      41: {
        type: "moment",
        prompt: "He is a whole knight richer and beautifully arranged. There is a seam in his second rank, thin as a paper cut.",
        instincts: [
          { text: "Get the piece back. You're losing, materially speaking.", refusal: "Materially speaking, yes. Your hand does not speak material. It is running its finger along the seam." },
          { text: "The rook slides into the cut — the second rank, behind everything.", destiny: true },
        ],
        stamp: "!", eval: 0.4,
        after: [["cass", "Rook to f2! Into the palace laundry! It can't be — no, it cannot be taken, the bishop hangs, the g-pawn falls — it just LIVES there now!"]],
      },
      43: { after: [["room", "The other rook queues behind it, patient as Tuesday."]], eval: 1.2 },
      45: { after: [["ply", "Rooks doubled on the cut. Feld's pieces are each defending one another in a closed circle, which would be touching if any of them could also move."]], eval: 2.2 },
      47: {
        type: "moment",
        prompt: "His army is enormous and perfectly arranged and beginning, very quietly, to suffocate. One of your bishops knows the last open window.",
        instincts: [
          { text: "Strike now — crash through on the seam while he's tangled!", refusal: "Loud. Your hand has gone all evening without raising its voice, and it is not starting for a mere win." },
          { text: "The pale bishop steps to the window ledge and closes it.", destiny: true },
        ],
        stamp: "!", eval: 4.4,
        after: [
          ["cass", "Bishop d3. It threatens — hold on. It threatens nothing? Miranda, it threatens NOTHING—"],
          ["ply", "Correct. It merely removes White's last two legal ideas. Threats end games; this ends the language."],
        ],
      },
      48: { think: 380, thinkMs: 3600, after: [["room", "Feld shuffles a rook one square, the way a man in a shrinking room adjusts a picture frame."]] },
      49: {
        type: "moment",
        prompt: "Everything of his is defended. Nothing of his can move without dying. It is your turn, and the cruellest thing on the board is a small pawn with nowhere urgent to be.",
        instincts: [
          { text: "Deliver something — check him, strike, finish it with noise!", refusal: "(No.)" },
          { text: "Push the little pawn one square. Ask nothing. Take nothing. Wait.", sub: "the quietest move in the hall", destiny: true },
        ],
        stamp: "!!", eval: 9.5,
        after: [
          ["cass", "…pawn to h6. Pawn to h6?! THAT'S the— Miranda, tell the people at home what they are looking at."],
          ["ply", "Zugzwang. He is not in check. He has lost nothing yet. It is his turn, and every single move he owns now loses — the pawns give mate or the queen, the rook abandons the back door, the king steps into the rook's teeth. His position is perfect and there is no move that keeps it. The word is German. The condition is universal."],
        ],
      },
    },
    outcome: {
      kind: "resign",
      ritual: [
        ["pause", 1600],
        ["room", "Feld looks at the board for a long time. He is not calculating. He is saying goodbye."],
        ["say", "cass", "He's reaching for the king — no, he's stopped. Reaching — stopped again. The great refuser, refusing to the very end—"],
        ["pause", 900],
        ["tip", "slow"],
        ["say", "room", "His one committal move of the night. Beautifully played, everyone agrees."],
      ],
      say: [
        ["ply", "White resigns, on move, in a position where he is allowed to do anything he likes and can afford none of it. The Immortal Zugzwang, they will call it. Dr Feld wrote three volumes on not moving. Tonight he received the fourth."],
      ],
      headlines: [
        { style: "broadsheet", src: "The Vosskerry Intelligencer", text: "FELD RUNS OUT OF MOVES ENTIRELY; WITNESSES INSIST BOARD 'LOOKED FULL'" },
        { style: "wire", src: "wire services", text: "VOSSKERRY: LOCAL PAWN ADVANCES ONE SQUARE. GRANDMASTER RESIGNS. NO FURTHER DETAILS AVAILABLE OR NECESSARY." },
      ],
    },
    reveal: {
      place: "Copenhagen", year: 1923,
      players: "Aron Nimzowitsch against Friedrich Sämisch — the Immortal Zugzwang Game.",
      note: "A pawn to h6, and White resigned with every piece on the board. Move for move.",
    },
  },

  // ══════════════════════════════════════════════════════════════ ROUND V ══
  {
    id: "fischer",
    round: 5, roundLabel: "V", youAre: "b",
    title: "The Federation Man",
    opponent: {
      name: "GM Octavio Sandoval-Quist",
      sub: "chair of nine committees, survivor of none",
      rating: 2575, glyph: "❦",
      bio: "Silver at the temples, medals at the breast, an aide at the elbow. Plays the board the way he chairs a meeting: soundly, handsomely, and one insight short. His aide handles the coat, the water, and — when required — the king.",
    },
    youRatingBefore: 2731, youRatingAfter: 2799,
    intro: [
      "The papers have started calling you things. 'The Vosskerry Ghost.' 'The Instant Stranger.' 'That Person' (the chess press, who are above nicknames, and furious about it).",
      "Sandoval-Quist greets you with the warm handshake of a man who has already drafted his account of the evening.",
    ],
    clockSecs: 5400,
    line: "1.Nf3 Nf6 2.c4 g6 3.Nc3 Bg7 4.d4 O-O 5.Bf4 d5 6.Qb3 dxc4 7.Qxc4 c6 8.e4 Nbd7 9.Rd1 Nb6 10.Qc5 Bg4 11.Bg5 Na4 12.Qa3 Nxc3 13.bxc3 Nxe4 14.Bxe7 Qb6 15.Bc4 Nxc3 16.Bc5 Rfe8+ 17.Kf1 Be6 18.Bxb6 Bxc4+ 19.Kg1 Ne2+ 20.Kf1 Nxd4+ 21.Kg1 Ne2+ 22.Kf1 Nc3+ 23.Kg1 axb6 24.Qb4 Ra4 25.Qxb6 Nxd1 26.h3 Rxa2 27.Kh2 Nxf2 28.Re1 Rxe1 29.Qd8+ Bf8 30.Nxe1 Bd5 31.Nf3 Ne4 32.Qb8 b5 33.h4 h5 34.Ne5 Kg7 35.Kg1 Bc5+ 36.Kf1 Ng3+ 37.Ke1 Bb4+ 38.Kd1 Bb3+ 39.Kc1 Ne2+ 40.Kb1 Nc3+ 41.Kc1 Rc2#",
    finalFen: "1Q6/5pk1/2p3p1/1p2N2p/1b5P/1bn5/2r3P1/2K5 w - - 16 42",
    preludeTo: 20,
    onSit: [
      ["room", "The aide places the water glass at the regulation distance. Sandoval-Quist nods at it, chairing the glass."],
      ["cass", "Round five, and I'll say what everyone's thinking: four rounds, four masterpieces. That does not HAPPEN. Ghosts don't have a repertoire!"],
      ["ply", "PROMETHEUS has begun flagging our stranger's moves before they are played. Twice tonight it has been wrong about which brilliancy was coming. It has not been wrong about there being one."],
    ],
    montageDrift: {
      9: ["room", "A tidy opening. The Federation Man approves of tidy openings; they photograph well."],
      17: ["cass", "The stranger plays like someone HUMMING, Miranda. Like all of this is a song they half-remember."],
    },
    crystallize: [["room", "Sandoval-Quist's queen has wandered far from home to win a piece. The hall does its sums. The sums feel wrong."]],
    beats: {
      20: { say: [["ply", "White pins the knight and expects, reasonably, to be playing chess for another four hours."]] },
      21: {
        type: "moment",
        prompt: "Your knight could go where knights go. Or it could step onto the one square the books mark 'never' — the rim, undefended, alone.",
        instincts: [
          { text: "Develop sensibly. The books have opinions about the rim.", refusal: "The books were not here last night. Or the night before. Your hand has stopped consulting them." },
          { text: "The knight steps to the rim — the 'wrong' square — and the whole board tilts.", destiny: true },
        ],
        stamp: "!!", eval: 0.9,
        after: [
          ["cass", "Knight A4!! The square every teacher forbids! And it — wait — it WORKS?! Every capture loses material, HOW does it—"],
          ["ply", "It has been played by exactly one other person in recorded history. A thirteen-year-old. I'll say nothing further at this time."],
        ],
      },
      23: { eval: 1.1 },
      25: { stamp: "!", eval: 1.4, after: [["ply", "Knight takes the center pawn. The dark bishop is trapped in the corner shop it burgled; the stranger declines to arrest it. Grander theft is scheduled."]] },
      26: { pace: 1400, after: [["room", "White's bishop grabs the e7 pawn on its way past, like a committee expensing lunch."]] },
      30: { think: 260, thinkMs: 3000, say: [["cass", "Bishop c5 — he's found it, the only try — the stranger's queen is trapped! TRAPPED, Miranda! At last a bill the ghost cannot pay!"]] },
      31: { eval: 1.2, after: [["ply", "Rook check first. Note the order of things. The order of things is the entire game."]] },
      33: {
        type: "moment",
        prompt: "Your queen is trapped. There is no square on the board that saves her. The room is already composing your obituary — and your bishop, unhurried, is looking at a quiet square by the window.",
        instincts: [
          { text: "Save the queen — there must be SOMETHING. Look harder.", refusal: "There is no saving her. There is only spending her. Your hand knows the difference, and the difference is this round." },
          { text: "Leave her. Set the bishop by the window. Let him take the most expensive queen ever sold.", sub: "the price is his king", destiny: true },
          { text: "Take the bishop that traps her — trade the problem away.", refusal: "Your hand greyed this option out before you finished reading it. It is sorry. It isn't." },
        ],
        slow: true, stamp: "!!", evalFlicker: -2.8, eval: 1.8,
        after: [
          ["cass", "BISHOP E6!!! THE QUEEN STAYS ON THE GALLOWS! He's offered the full queen for a bishop and a — a DRAUGHT, an idea, a—"],
          ["ply", "PROMETHEUS initially scores this minus 2.8 for Black. Depth twenty-two: minus 0.4. Depth thirty: plus 1.8 and climbing, with a windmill warning. The machine calls it an error, then a miracle, in the same output line. The machine will apologize in twenty years."],
        ],
      },
      34: {
        pace: 1900, think: 420, thinkMs: 3800,
        after: [["room", "Sandoval-Quist takes the queen. Somewhere in the hall, someone's chair creaks like a ship."]],
      },
      35: {
        type: "combo", until: 43,
        wind: [
          ["ply", "What follows contains a discovered check on every alternate move for the foreseeable future. A carousel of them. I have pre-computed my reactions."],
          ["cass", "Hold something, everyone."],
        ],
        lines: ["Check.", "Again.", "Check.", "Cass is standing.", "Check.", "The carousel turns.", "Check.", "Cass is on the table.", "Check."],
        eval: 2.6,
      },
      45: {
        pace: 1100, eval: 3.2,
        after: [
          ["ply", "…I had not pre-computed that. Ladies and gentlemen: the queen is avenged in instalments — a bishop, a second pawn, shortly a rook and another bishop, the entire estate in small change. The rest, as they say, is a matter of technique."],
          ["cass", "The books never say WHOSE technique."],
        ],
      },
      46: { techniqueTo: 68 },
      68: { pace: 900, say: [["room", "An hour later the hall has thinned, the tea has gone cold, and the Federation Man's king begins its last walk in a suit of checks."]] },
      69: {
        type: "combo", until: 81, silence: true,
        wind: [["ply", "Mating net, seven moves deep, every reply forced. For the non-players: from here the board plays itself; the stranger merely signs each page."]],
        lines: ["Check.", "The king runs.", "Check.", "He is running out of board.", "Check.", "Down the whole board he runs.", "Check."],
        eval: 9.0,
      },
    },
    outcome: {
      kind: "mate",
      ritual: [
        ["pause", 900],
        ["say", "cass", "MATE! Mate with the little rook, the king marched from his front door to the far corner of the estate and mated by the SERVANTS' entrance!"],
        ["room", "The aide, one beat too late, reaches for the king to resign it. The mate has already resigned it for him. The aide adjusts the water glass instead, for something official to do."],
        ["say", "ply", "Twenty-four moves ago our stranger's queen was 'lost'. The final tally: he kept the queen. It cost him everything else he owned."],
      ],
      say: [
        ["cass", "They'll teach this one, Miranda. Somewhere a teacher is already clearing wall space."],
      ],
      headlines: [
        { style: "wire", src: "wire services", text: "VOSSKERRY RD 5 — GHOST SELLS QUEEN, BUYS BOARD. FEDERATION MAN MATED IN CORNER OF OWN ESTATE. COMMITTEE FORMED." },
        { style: "wire", src: "wire services, follow-up", text: "CORRECTION TO EARLIER WIRE: NOT 'GAME OF THE NIGHT'. GAME OF THE CENTURY. THE DESK REGRETS THE UNDERSTATEMENT." },
      ],
    },
    reveal: {
      place: "New York", year: 1956,
      players: "Bobby Fischer, aged thirteen, against Donald Byrne — the Game of the Century.",
      note: "The queen left on the gallows, the carousel of checks, the long cold conversion. Move for move, including the walk.",
    },
  },

  // ═════════════════════════════════════════════════════════════ ROUND VI ══
  {
    id: "shirov",
    round: 6, roundLabel: "VI", youAre: "b",
    title: "The Peacemaker",
    opponent: {
      name: "Sister Ingrid Halvorsen",
      sub: "has offered a draw in 41 consecutive games",
      rating: 2540, glyph: "½",
      bio: "Believes every chess game is a draw that has not yet forgiven itself. Has offered a draw in forty-one consecutive games including, once, to a fire alarm. Endgames are her cloister; nobody escapes them with more than half a point. Nobody ever has.",
    },
    youRatingBefore: 2799, youRatingAfter: 2846,
    intro: [
      "Five hours, this one. The longest of the night. The radiators tick; the sea sounds like an audience that has forgotten which side it is on.",
      "Deep into the fifth hour the board has gone quiet and pale: bishops of opposite colours, a scatter of pawns, the kind of ending the textbooks stamp DRAWN in tired grey letters. Sister Ingrid has already reached for the scoresheets twice, hopeful.",
    ],
    arbiterNote: "The position joins us five hours in. The clocks have seen things.",
    clockSecs: 1900,
    startFen: "8/8/4kpp1/3p1b2/p6P/2B5/6P1/6K1 b - - 2 47",
    line: "47...Bh3 48.gxh3 Kf5 49.Kf2 Ke4 50.Bxf6 d4 51.Be7 Kd3 52.Bc5 Kc4 53.Be7 Kb3",
    finalFen: "8/4B3/6p1/8/p2p3P/1k5P/5K2/8 w - - 6 54",
    preludeTo: 0,
    onSit: [
      ["room", "Sister Ingrid smiles at the pale, empty board the way one smiles at a garden put to bed for winter."],
      ["cass", "Bishops of OPPOSITE colours, Miranda. For the non-players: hers walks the dark squares, the stranger's walks the light — two ghosts in the same house who can never touch. It is the drawest draw in the book of draws."],
      ["ply", "PROMETHEUS: 0.00. It has held 0.00 for an hour. Sister Ingrid has offered the draw twice. The stranger keeps looking at their own bishop as if it owes them something."],
    ],
    beats: {
      0: {
        type: "moment",
        prompt: "The dead-drawn endgame. Her fortress needs every one of its stones. Your bishop — your only real piece — could stay safe forever. Or it could do the one thing no piece is ever asked to do.",
        instincts: [
          { text: "Take her h-pawn — at least win something back.", refusal: "No." },
          { text: "March your king forward. Press. Grind. Hope.", refusal: "(The grind holds. Barely, greyly, for sixty more moves, to the draw she has already written down.)" },
          { text: "Throw the bishop away. Into the corner. For nothing.", sub: "not for nothing — for a road", destiny: true },
        ],
        slow: true, stamp: "!!", evalFlicker: -0.6, eval: 1.6,
        after: [
          ["cass", "BISHOP H3!! He's thrown the bishop into the — it takes NOTHING, it threatens NOTHING, it can be taken by the PAWN—"],
          ["ply", "PROMETHEUS: 0.00… 0.00… — recalculating. One moment. The machine has pulled its hands off the keys, Casimir. Depth forty: the pawn must take, and taking builds a wall in front of its OWN king while our stranger's king walks through the space the bishop paid for. The machine calls the bishop move an error. The machine will apologize in twenty years. Minus— correction. Plus. Winning. It's winning."],
        ],
      },
      1: { pace: 2400, think: 300, thinkMs: 4000, after: [["room", "She takes it. She must. The bishop dies so quietly that three people in the gallery miss it and have to be told, and don't believe it, and are right not to."]] },
      2: { after: [["cass", "And NOW the king walks. Watch this. WATCH this."]], eval: 2.4 },
      4: { eval: 4.0, after: [["ply", "Through the middle. Her bishop watches from the dark squares — wrong colour, wrong church, wrong century. It cannot even wave."]] },
      5: { pace: 1500, after: [["room", "She wins the last kingside pawn, which is like being paid in full on the deck of a sinking ship."]] },
      6: { eval: 6.0, after: [["ply", "The d-pawn starts running. Her bishop cannot stop it and her king lives four streets away. This is what the bishop bought on h3: one tempo, one wall, one road."]] },
      8: { eval: 7.4 },
      10: { eval: 8.6 },
      11: { think: 420, thinkMs: 3600 },
      12: {
        eval: 9.8,
        after: [["ply", "King b3. The a-pawn walks in with an escort of one. Arithmetic: her bishop must give itself for the a-pawn, and then the d-pawn queens on the OTHER colour. Two roads. One bishop. The end."]],
      },
    },
    outcome: {
      kind: "resign",
      ritual: [
        ["pause", 1100],
        ["whisper", "Sister Ingrid offers the draw one final time, gently, to a lost position — the way one offers tea to a departing guest."],
        ["pause", 1400],
        ["room", "The arbiter, with enormous tenderness, shakes his head."],
        ["pause", 700],
        ["tip", "slow"],
        ["say", "room", "She lays her king down as if tucking it in. 'Forty-two,' she says, to her scoresheet. The streak is intact. It is just wearing a nought."],
      ],
      say: [
        ["cass", "She's the finest endgame wall in the north and the stranger walked THROUGH her — by throwing away the only piece that could open the door!"],
        ["ply", "The bishop, for the record, is still on h3. In a manner of speaking, it is the only piece that made it home."],
      ],
      headlines: [
        { style: "broadsheet", src: "The Vosskerry Intelligencer", text: "STRANGER AT BOARD ONE DECLINES DRAW, SANITY; WINS BOTH" },
        { style: "broadsheet", src: "chess column", text: "'WORST BISHOP MOVE ON THE BOARD, AND THE ONLY ONE THAT WINS' — OUR CORRESPONDENT, STILL SHOUTING" },
      ],
    },
    reveal: {
      place: "Linares", year: 1998,
      players: "Alexei Shirov against Veselin Topalov — Bh3!!",
      note: "The bishop thrown into the corner of a dead draw, to buy the king a road. Engines needed twenty years to agree. You needed a heartbeat.",
    },
  },

  // ════════════════════════════════════════════════════════════ ROUND VII ══
  {
    id: "kasparov",
    round: 7, roundLabel: "VII", youAre: "w",
    title: "The Prodigy",
    opponent: {
      name: "“Turbo” Ganz",
      sub: "streams his own games, narrates his wins",
      rating: 2620, glyph: "⚡",
      bio: "Twenty-two, insufferable, brilliant. Plays with one hand, spins captured pieces, and has beaten everyone in this hall at blitz, some of them twice at once. Calls the classics 'homework'. Has never once been made into homework himself.",
    },
    youRatingBefore: 2846, youRatingAfter: 2871,
    intro: [
      "Final round of the invitational. Six wins. The word 'perfect' is being whispered near the tea urn with the reverence usually reserved for weather at sea.",
      "Ganz cracks his knuckles, grins at the gallery, and says — loudly enough for the gallery — 'No offence, but ghosts lose to pressure.' The gallery writes it down for later.",
    ],
    clockSecs: 5400,
    line: "1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Be3 Bg7 5.Qd2 c6 6.f3 b5 7.Nge2 Nbd7 8.Bh6 Bxh6 9.Qxh6 Bb7 10.a3 e5 11.O-O-O Qe7 12.Kb1 a6 13.Nc1 O-O-O 14.Nb3 exd4 15.Rxd4 c5 16.Rd1 Nb6 17.g3 Kb8 18.Na5 Ba8 19.Bh3 d5 20.Qf4+ Ka7 21.Rhe1 d4 22.Nd5 Nbxd5 23.exd5 Qd6 24.Rxd4 cxd4 25.Re7+ Kb6 26.Qxd4+ Kxa5 27.b4+ Ka4 28.Qc3 Qxd5 29.Ra7 Bb7 30.Rxb7 Qc4 31.Qxf6 Kxa3 32.Qxa6+ Kxb4 33.c3+ Kxc3 34.Qa1+ Kd2 35.Qb2+ Kd1 36.Bf1 Rd2 37.Rd7 Rxd7 38.Bxc4 bxc4 39.Qxh8 Rd3 40.Qa8 c3 41.Qa4+ Ke1 42.f4 f5 43.Kc1 Rd2 44.Qa7",
    finalFen: "8/Q6p/6p1/5p2/5P2/2p3P1/3r3P/2K1k3 b - - 3 44",
    preludeTo: 38,
    onSit: [
      ["room", "Both kings castle long and glare at each other across the whole board, like lighthouses."],
      ["cass", "Round seven! Winner takes the invitational — and Ganz has come to FIGHT, none of your quiet stuff, this is a knife-drawer of a position."],
      ["ply", "Both kings behind the same wall, queenside — and both pawn storms already marching on the other fellow's address anyway. For the non-players: the loser is whoever blinks. Neither has blinked in seventeen moves. PROMETHEUS is enjoying itself, insofar as we can measure that, and we have tried."],
    ],
    montageDrift: {
      14: ["room", "Ganz spins a captured pawn on the table. The arbiter's eyebrow files a complaint."],
      28: ["cass", "The stranger's pieces are starting to lean toward Ganz's king. You can FEEL the lean."],
    },
    crystallize: [["room", "Ganz's pawn storms forward; his king stands behind a wall with one brick loose."]],
    beats: {
      38: { after: [["ply", "Queen check; the king steps aside to a7, where it will remain safe for exactly six more moves."]] },
      41: {
        think: 280, thinkMs: 3000, eval: -0.4,
        after: [["cass", "Ganz stabs the pawn to d4 — the center cracks open and his eval-needle twitches HIS way, look at it — he's already narrating his stream recap, you can see his lips moving—"]],
      },
      42: {
        type: "moment",
        prompt: "His pawn wall has thrown a stone at your knight. Every retreat is respectable. The knight is not feeling respectable — there is a hole in the middle of everything, one square wide.",
        instincts: [
          { text: "Retreat the knight to safety.", refusal: "Retreat the knight to safety. — this option has declined to explain itself further. (No.)" },
          { text: "The knight steps INTO the hole. Let them choose which way to be lost.", destiny: true },
        ],
        stamp: "!", eval: 0.5,
        after: [["ply", "The knight cannot be ignored and cannot be safely taken, which Ganz will now demonstrate by taking it."]],
      },
      45: {
        think: 340, thinkMs: 3200,
        after: [["room", "Ganz tidies his queen to a safe square and relaxes. Grandmasters relax exactly one move too early; it is in the curriculum."]],
      },
      46: {
        type: "moment",
        prompt: "Everything is tense and defended and correct. Your rook is looking at a defended pawn in the middle — a pawn it has absolutely no right to take.",
        instincts: [
          { text: "Keep the tension. Improve something small. Stay correct.", refusal: "Correct. Yes. Your hand has spent seven rounds learning what correct is worth at this table." },
          { text: "The rook takes the poisoned pawn. Pull the thread that unravels the king.", destiny: true },
          { text: "Trade queens — his attack dies with the queens.", refusal: "(So does the thing the papers have started calling you.)" },
        ],
        slow: true, stamp: "!!", evalFlicker: -1.6, eval: 2.0,
        after: [
          ["cass", "ROOK TAKES D4!! It's unsound! It MUST be unsound! Miranda, tell me it's unsound—"],
          ["ply", "PROMETHEUS flags it as an error at depth twelve. At depth twenty-six it un-flags it and issues what I can only describe as a retraction. The machine calls it an error; the machine will apologize in twenty years. Meanwhile the king on a7 has begun to hear footsteps."],
        ],
      },
      48: {
        type: "moment",
        prompt: "He took the rook. Of course he took the rook. Now the second one clears its throat, looking at the seventh rank — check, and the palace doors blow open.",
        instincts: [
          { text: "The other rook, through the doors, with the wind behind it.", destiny: true },
          { text: "Recover material first — take something, anything.", refusal: "One word: (no). Your hand has stopped writing footnotes. The moves ARE the footnotes now." },
        ],
        stamp: "!!", eval: 2.8,
        after: [["cass", "Rook e7 CHECK — both rooks flung into the fire in two moves, and Ganz's king has to come OUT, out into the weather—"]],
      },
      50: {
        type: "combo", until: 52,
        wind: [["ply", "King hunt. For the non-players: the rarest bird in chess — a king dragged from its castle across a full board in daylight. Count the checks aloud if it helps. It helps Casimir."]],
        lines: ["Check.", "The king comes out.", "Check."],
        eval: 3.2,
      },
      54: {
        type: "moment",
        prompt: "The king stands in the open, one square from home, and every loud move lets it slip back. The hunt does not need a shout. It needs a door closed, quietly, behind him.",
        instincts: [
          { text: "Check him again — keep the whip cracking!", refusal: "Loud. (The king slips home through b5. The stream recap writes itself, and you are its villain.)" },
          { text: "No check. The queen steps sideways and locks the road home.", sub: "the quiet move inside the storm", destiny: true },
        ],
        stamp: "!", eval: 3.6,
        after: [["ply", "No check. No capture. The king's road home is now a wall. PROMETHEUS has stopped suggesting moves for Black and begun suggesting condolences."]],
      },
      55: { after: [["room", "Ganz grabs a pawn back, centre-stage, with the expression of a man buying a souvenir of a city that is on fire."]] },
      56: { say: [["cass", "The rook knocks on the seventh again—"]], eval: 4.0 },
      58: { eval: 4.4 },
      59: { after: [["ply", "He offers the queens off. Our stranger declines by ignoring the offer entirely, which in chess is legal and in Vosskerry is now fashion."]] },
      61: { after: [["room", "The king, incredibly, takes a pawn on its way through the storm — a condemned man pocketing the courtroom stationery."]], eval: 4.8 },
      62: {
        type: "combo", until: 68,
        wind: [["cass", "Across the board he goes — a3, b4 — Miranda, the king has crossed the EQUATOR—"]],
        lines: ["Check.", "He runs.", "Check.", "Across the whole board he runs.", "Check.", "There is nowhere left that is his."],
        eval: 6.0,
      },
      70: {
        stamp: "!", eval: 7.4, pace: 1500,
        after: [
          ["cass", "A bishop move?! BACKWARDS?! Now?! Cass is standing. Cass has been standing for some time—"],
          ["ply", "Bishop to f1, retreating to its starting square, and it is the prettiest move of the night: the cage's last quiet bar. Casimir is referring to himself in the third person; log it as an eruption."],
        ],
      },
      72: { stamp: "!", eval: 8.2, after: [["ply", "Rook d7 — deflection. The last defender is invited to leave, and, being a defender, it accepts."]] },
      74: { eval: 9.0 },
      75: {
        pace: 1200,
        after: [["room", "The dust settles: the stranger has a queen; Ganz has a rook, three pawns, and the sudden intense silence of a man whose stream recap has become someone else's."]],
      },
      76: { techniqueTo: 87 },
    },
    outcome: {
      kind: "resign",
      ritual: [
        ["pause", 1000],
        ["say", "ply", "For the record, our mystery guest has now spent less total time this evening than the arbiter spent unwrapping the pieces."],
        ["room", "Ganz looks at his king. His king — checked eleven times, marched forty squares, and currently sheltering in a corner of the stranger's half of the board — looks back."],
        ["pause", 800],
        ["tip"],
        ["say", "room", "Ganz tips it himself, then — professional to the end — reaches over and shakes the stranger's hand for the cameras that are not allowed in here."],
      ],
      say: [
        ["cass", "SEVEN! SEVEN FROM SEVEN! A perfect score at the Vosskerry Invitational — the crosstable looks like a COLUMN OF SOLDIERS!"],
        ["ply", "7–0. The last perfect score anyone in this room can cite is Fischer's 11–0, and he had the advantage of knowing what the pieces are called."],
      ],
      headlines: [
        { style: "clickbait", src: "ganz.stream — community post", text: "You Won't Believe Where This King Ended Up (Slide 34 of 34)" },
        { style: "clickbait", src: "ganz.stream — pinned comment, by Ganz", text: "ok. that was homework. i'm the homework now. gg. — T.G." },
      ],
    },
    reveal: {
      place: "Wijk aan Zee", year: 1999,
      players: "Garry Kasparov against Veselin Topalov — Kasparov's Immortal.",
      note: "The rook on d4, the king dragged across the entire board, the quiet Qc3 and the backwards Bf1. Move for move, all forty-four.",
    },
  },

  // ═══════════════════════════════════════════════════════════ ROUND VIII ══
  {
    id: "prometheus",
    round: 8, roundLabel: "VIII", youAre: "w",
    exhibition: true, machine: true,
    title: "The Machine",
    opponent: {
      name: "PROMETHEUS",
      sub: "operator: one; opinions: none",
      rating: 3600, ratingLabel: "rated 3600 · cooled to 16°C",
      glyph: "▣",
      bio: "Three cabinets, one printer, a human operator to move the pieces. Hobbies: none. Weaknesses: none. Previous defeats: none. It has requested the room temperature be lowered by two degrees. The room has complied.",
    },
    youRatingBefore: 2871, youRatingAfter: 2883,
    intro: [
      "After the banquet, the sponsors wheel it in on a trolley: PROMETHEUS itself, down from the capital, cables coiled like sleeping eels. An exhibition, they say. A curiosity. The operator sets the board and does not meet your eye.",
      "All night, Dr Ply has been quoting it. Now the booth is quiet: tonight the machine is not commentary. Tonight the machine is opposite.",
      "You join the game four hours in — the position they will argue about for a century. PROMETHEUS's queen has moved into your basement, its knight hangs over the soft pawn in front of your king, and its evaluation lamp glows a contented plus-two. In its favour.",
    ],
    arbiterNote: "The clocks are ceremonial. PROMETHEUS moves in milliseconds. This will matter less than everyone thinks.",
    clockSecs: 7200,
    evalStart: -1.9,
    startFen: "5r1k/1b4pp/p1p5/6N1/1pQ3n1/q7/PPP2PPP/1K1RR3 w - - 0 32",
    line: "32.Rd8 Rxd8 33.Re8+ Rxe8 34.Nf7+ Kg8 35.Nh6+ Kh8 36.Qg8+ Rxg8 37.Nf7#",
    finalFen: "6rk/1b3Npp/p1p5/8/1p4n1/q7/PPP2PPP/1K6 b - - 1 37",
    preludeTo: 0,
    onSit: [
      ["room", "The hall is fuller than it was for any round of the invitational. Nobody has gone home. The sea outside has gone quiet, professionally."],
      ["cass", "…Cass has nothing. Cass is standing, but quietly."],
      ["mach", "EVAL +2.1. NXF2 BREAKTHROUGH PREPARED. EXPECTED CONTINUATION: DEFENCE."],
      ["ply", "Its plan: knight through f2, queen up through the cellar, your king dies of paperwork. It is a good plan. It requires one more move, and it expects you to spend yours defending. I want to say, before whatever happens next: it has been the honour of my career to mis-predict you all night."],
    ],
    nudges: [
      "The operator watches your hovering hand. The machine watches the operator.",
      "Not there. The road is narrower than that, and brighter.",
    ],
    beats: {
      0: {
        type: "moment",
        prompt: "Its threat arrives next move and the defence is known, grey, and endless. On your side of the board: two rooks, side by side, and an empty square deep in its territory that neither of them has any honest business visiting.",
        instincts: [
          { text: "Defend. The queen in your basement comes first. Everyone agrees.", refusal: "Everyone agrees. The book agrees, the machine agrees, the operator's face agrees. (Your hand has resigned from everyone.)" },
          { text: "The first rook steps into the empty square. No check. No capture. A quiet word in a burning house.", destiny: true },
          { text: "Queen back to hold the line — solid, tested, alive.", refusal: "(No.)" },
        ],
        slow: true, stamp: "!!", eval: -1.9,
        after: [
          ["mach", "RD8: NOT IN OPENING BOOK. NOT IN GAME LIBRARY. NOT IN CORRESPONDENCE ARCHIVE. EVAL +2.3. CAPTURE FORCED."],
          ["ply", "It says thank you. It has seen the rook. I do not think it has seen the coffin."],
        ],
      },
      1: { pace: 420, eval: -2.3, after: [["room", "The operator's hand takes the rook for the machine. The hand is steady. The wrist is not."]] },
      2: {
        type: "moment",
        prompt: "It has eaten the first rook. The square is empty again, and the second rook is already leaning toward it — toward the check that costs everything you have left.",
        instincts: [
          { text: "The second rook follows the first. All of it. Everything. Now.", destiny: true },
          { text: "Surely — surely — keep ONE rook—", refusal: "(No. The night has been an argument for exactly this. Both.)" },
        ],
        slow: true, stamp: "!!", eval: -2.3,
        after: [
          ["cass", "BOTH ROOKS. He's given the machine both rooks. Miranda. MIRANDA."],
        ],
      },
      3: {
        think: 840, thinkMs: 13000, mono: true,
        say: [
          ["mach", "…"],
          ["room", "The machine does not move. A cooling fan changes pitch. Fourteen minutes, its longest think of the night — of any night. The hall learns what it sounds like when three cabinets scream."],
          ["ply", "A machine thinking is a machine screaming, Casimir. It has found the coffin. It is reading its own name."],
        ],
        eval: 6.0,
        after: [
          ["mach", "EVAL —. EVAL —. CONTINUATION FORCED. ALL CONTINUATIONS FORCED."],
          ["ply", "It played the only legal move. From here it will play only moves, forever. This move is not in the tablebase, the database, or the literature. I have nowhere to look it up. …I love it?"],
        ],
      },
      4: {
        type: "combo", until: 6,
        wind: [["ply", "Knight comes in with check — watch the little horse do the last proof."]],
        lines: ["Check.", "It knows.", "Check. Every other path is a shorter coffin."],
        eval: 8.0,
      },
      8: {
        type: "moment",
        prompt: "The board has gone grey at the edges. The machine's king stands in its doorway, and your queen — your last heavy piece — sees one square, guarded, absurd, shining.",
        instincts: [
          { text: "There was only ever one move.", sub: "you have known it since the coins", destiny: true },
        ],
        slow: true, stamp: "!!", eval: 9.5,
        after: [
          ["mach", "QG8: QUEEN OFFERED. CAPTURE FORCED. RESULT KNOWN."],
        ],
      },
      9: { pace: 500, after: [["room", "The rook takes the queen because it is the only legal move on Earth. The smothering is complete: its own pieces seal its own doors."]] },
      10: {
        type: "combo", until: 10, silence: true,
        lines: ["…"],
        wind: [["ply", "Knight to f7. Say it with your hands."]],
      },
    },
    outcome: {
      kind: "machine",
      ritual: [
        ["pause", 1300],
        ["fans"],
        ["say", "room", "The fans spin down, one by one. The evaluation lamp, for the first time tonight, goes dark."],
        ["clocks"],
        ["pause", 900],
        ["say", "mach", "NO IMPROVEMENT FOUND. CONGRATULATIONS."],
        ["pause", 700],
        ["say", "room", "The printer feeds out the single line, tears it off, and the hall — which has been holding its breath for eleven minutes — remembers how the other thing goes."],
        ["say", "room", "The operator stops the clocks, stands, and offers a human hand."],
      ],
      say: [
        ["cass", "Smothered. SMOTHERED! The queen given away with an entire hall watching the only square she could possibly— I have narrated four thousand games and I have been WAITING for this one!"],
        ["ply", "Queen and both rooks, against the strongest calculating object on the planet, and from the moment the first rook stepped quietly into d8, every reply was its only legal move — or a faster funeral. We have verified this. It has verified this. That is what the fourteen minutes were."],
      ],
      headlines: [
        { style: "stark", src: "", text: "THE MACHINE RESIGNED. THE PRINTOUT SAID 'CONGRATULATIONS'. NOBODY HAS GONE HOME." },
      ],
    },
    reveal: {
      place: "Vosskerry", year: null,
      players: "You, against PROMETHEUS.",
      note: "Two rooks to the same empty square, a queen onto a guarded one, and a knight to close the lid. This game exists nowhere else. It is yours.",
    },
  },
];
