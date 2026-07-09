// Span of Control — all words live here. Pure data, no logic.
//
// CARD SCHEMA
//   { id, cast, kind, title?, text, weight?, once?, minQuarter?, maxQuarter?,
//     requiresFlags?, forbidsFlags?, ritual?, left: CHOICE, right: CHOICE }
//   kind: email | invite | chat | memo | postit | slide | report | ritual
//   CHOICE = { label, effects?: {leadership?, team?, you?, headcount?},
//              setFlags?, clearFlags?, followup?: {card, delay?},
//              homily?, ending?, quip? }
//   Meter effects are integers, roughly -12..+12 (big moments up to ±18).
//   quip = one-line narrator aftermath, wry, ≤ 22 words.
//
// TONE: affectionate wry; the satire targets the system, never the player or
// the team. Absurdity escalates with minQuarter. British corporate register.

export const CAST = {
  diane: { name: "Diane Vane", role: "VP, Platform Synergy", voice: "speaks in deck titles" },
  greg: { name: "Greg", role: "Principal Engineer", voice: "weary, precise, right" },
  priya: { name: "Priya", role: "Engineer II", voice: "keen, excellent, wants your job" },
  colin: { name: "Colin Farrier", role: "Peer Manager", voice: "land-grabs framed as collaboration" },
  saskia: { name: "Saskia", role: "HR Business Partner", voice: "weaponised cheerfulness" },
  consultant: { name: "The Consultant", role: "Bainbridge McKallister", voice: "billable serenity" },
  marcus: { name: "Marcus", role: "Graduate Engineer", voice: "innocent, devastating questions" },
  janet: { name: "Janet", role: "Finance", voice: "rare, final" },
  company: { name: "Consolidated Progress plc", role: "Internal Communications", voice: "the weather" },
  you: { name: "You, to yourself", role: "Unsent drafts, 3am thoughts", voice: "the only honest channel" },
};

export const CARDS = [
  // ---- upward management -------------------------------------------------
  {
    id: "up-quickwin",
    cast: "diane",
    kind: "email",
    title: "Quick win?",
    text: "Can your team pick this up? Two days, tops. It is not two days. It has never once been two days.",
    left: {
      label: "“We’re at capacity this quarter”",
      effects: { leadership: -7, team: 6 },
      quip: "Diane forwards it to Colin. Colin’s org grows by exactly the size of the favour.",
    },
    right: {
      label: "“We’ll find the bandwidth”",
      effects: { leadership: 6, team: -7, you: -3 },
      quip: "The team finds the bandwidth. You find a way to say ‘bandwidth’ without wincing.",
      homily: "h-bandwidth",
    },
  },
  {
    id: "up-cascade",
    cast: "diane",
    kind: "email",
    title: "FW: FW: Our AI Pivot — CASCADE BY FRIDAY",
    text: "The deck is 84 slides. Slide 41 just says ‘Momentum’. You are to cascade this to your team with conviction.",
    left: {
      label: "Translate honestly: “nobody knows what this means yet”",
      effects: { team: 8, leadership: -7 },
      quip: "The team appreciates the honesty. Someone screenshots it. The screenshot travels.",
    },
    right: {
      label: "Forward with “Exciting times ahead!”",
      effects: { leadership: 5, team: -6 },
      quip: "Greg replies with a single thumbs-up. You both know what it means.",
      homily: "h-strategy",
    },
  },
  {
    id: "up-skip-level",
    cast: "diane",
    kind: "invite",
    title: "Skip-levels with your team",
    text: "Diane is scheduling skip-level 1:1s with your engineers. ‘Purely to stay close to the work.’ She has never been close to the work.",
    left: {
      label: "Brief the team on what not to volunteer",
      effects: { team: -4, you: -3, leadership: 3 },
      quip: "You hear yourself say ‘narrative discipline’ to people who fix real things.",
    },
    right: {
      label: "Let them speak freely",
      effects: { team: 6, leadership: -6 },
      quip: "Marcus tells Diane the roadmap is ‘aspirational’. He learned that word from your status reports.",
    },
  },

  // ---- downward management ------------------------------------------------
  {
    id: "down-estimate",
    cast: "greg",
    kind: "chat",
    title: "#migration-estimates",
    text: "Diane wants the migration estimate ‘more ambitious’. I can make the number smaller. I cannot make the work smaller.",
    left: {
      label: "Hold the line — give her the real number",
      effects: { leadership: -6, team: 7 },
      quip: "Greg says nothing, which from Greg is a standing ovation.",
    },
    right: {
      label: "Shave 20% — manage expectations later",
      effects: { leadership: 6, team: -5, you: -3 },
      quip: "‘Later’ is now load-bearing.",
    },
  },
  {
    id: "down-priya-ladder",
    cast: "priya",
    kind: "invite",
    title: "Career conversation",
    text: "Priya has prepared a slide about her path to management. It is better than any slide you have ever made. She wants your honest advice.",
    left: {
      label: "Tell her the truth about this job",
      effects: { team: 5, you: 4, leadership: -2 },
      quip: "She listens carefully, thanks you sincerely, and applies anyway. Ambition is waterproof.",
      homily: "h-org",
    },
    right: {
      label: "Encourage her — the org needs leaders",
      effects: { team: 3, leadership: 2, you: -2 },
      quip: "You hear yourself say ‘leadership journey’ unprompted. It didn’t even hurt. That’s the worrying part.",
    },
  },
  {
    id: "down-oncall",
    cast: "greg",
    kind: "chat",
    title: "#incident-review",
    text: "Third weekend page in a row. The fix is headcount or scope. Greg says this in the tone of a man who has said it before.",
    left: {
      label: "Take scope off the roadmap",
      effects: { leadership: -6, team: 8 },
      quip: "The roadmap shrinks. Diane notices roadmaps the way hawks notice movement.",
    },
    right: {
      label: "Promise a req you don’t have yet",
      effects: { team: 4, leadership: 0, you: -4 },
      setFlags: ["promised-req"],
      quip: "The team believes you. Now you just need Janet to.",
    },
  },

  // ---- peers & turf --------------------------------------------------------
  {
    id: "peer-colin-synergy",
    cast: "colin",
    kind: "invite",
    title: "Exploring synergies 📈",
    text: "Thirty minutes, no agenda, a co-presenter you’ve never met, and the phrase ‘natural home for this capability’ already in the invite body.",
    left: {
      label: "Decline: “agenda first”",
      effects: { leadership: -3, team: 2 },
      quip: "Colin reschedules it as a ‘working session’. The invite is now an hour.",
    },
    right: {
      label: "Accept, and bring your own deck",
      effects: { leadership: 4, you: -5 },
      setFlags: ["colin-war"],
      quip: "Mutually assured presentation. Nobody synergises. Honour is preserved.",
    },
  },
  {
    id: "peer-colin-poach",
    cast: "colin",
    kind: "chat",
    title: "DM",
    text: "‘Mate — quick one. If I could borrow two of yours for the Initiative, I’d obviously owe you one.’ The Initiative has no defined end date.",
    requiresFlags: ["colin-war"],
    left: {
      label: "“No one is being borrowed”",
      effects: { leadership: -2, team: 5 },
      quip: "Colin says ‘totally get it’ in a way that means the opposite.",
    },
    right: {
      label: "Lend Marcus — he’s keen",
      effects: { headcount: -1, leadership: 4, team: -4 },
      quip: "Marcus is now ‘dotted-line’. The dots are load-bearing. You have lost a Marcus.",
    },
  },

  // ---- process & ritual (weekly, not the forced quarter rituals) ----------
  {
    id: "proc-status-colour",
    cast: "company",
    kind: "report",
    title: "Weekly status: pick a colour",
    text: "The project is amber. Reporting amber invites ‘support’. Reporting green invites destiny. The template has no other colours.",
    left: {
      label: "Amber, with commentary",
      effects: { leadership: -4, team: 3, you: 2 },
      quip: "A Programme Office person you’ve never met books ‘time to unpack the amber’.",
    },
    right: {
      label: "Green. Everything is green",
      effects: { leadership: 3, you: -4 },
      setFlags: ["watermelon"],
      quip: "Green outside, red inside. The watermelon ripens quietly.",
      homily: "h-visibility",
    },
  },
  {
    id: "proc-watermelon-burst",
    cast: "diane",
    kind: "email",
    title: "Surprised to hear about the delay",
    text: "Diane is ‘surprised’, which in VP means furious. The project you greened for six weeks has publicly ambered itself.",
    requiresFlags: ["watermelon"],
    once: true,
    left: {
      label: "Own it: the reporting was optimistic",
      effects: { leadership: -8, team: 5, you: 3 },
      clearFlags: ["watermelon"],
      quip: "‘Optimistic’ does heroic work in that sentence. Diane respects the craft.",
    },
    right: {
      label: "Blame ‘upstream dependencies’",
      effects: { leadership: -2, team: -5 },
      clearFlags: ["watermelon"],
      quip: "Upstream, someone exactly like you blames their upstream. It’s turtles all the way up.",
    },
  },
  {
    id: "proc-meeting-audit",
    cast: "company",
    kind: "memo",
    title: "Meeting Reduction Initiative",
    text: "All managers must attend a 90-minute workshop on reducing meetings. Attendance is mandatory. A pre-read has been attached to the pre-meeting.",
    left: {
      label: "Attend, visibly",
      effects: { leadership: 2, you: -4 },
      quip: "The workshop resolves to form a working group. You are in the working group.",
      homily: "h-meetings",
    },
    right: {
      label: "Send Priya ‘for development’",
      effects: { you: 3, team: -2 },
      quip: "Priya returns with actions. For you.",
    },
  },

  // ---- the do-the-work trap -------------------------------------------------
  {
    id: "trap-dashboard",
    cast: "you",
    kind: "postit",
    title: "6:05pm",
    text: "The dashboard bug embarrassing Diane is right there. You used to fix things like this in an hour. The cursor blinks. It knows you.",
    left: {
      label: "Close the laptop — assign it tomorrow",
      effects: { you: 2, leadership: -2 },
      quip: "Delegation: the hardest commit is the one you don’t make.",
      homily: "h-delegate",
    },
    right: {
      label: "Crack your knuckles. You’ve still got it",
      effects: { you: 6, team: -6, leadership: -3 },
      setFlags: ["did-work"],
      quip: "You’ve still got it. The team now has a manager who does drive-by commits.",
      homily: "h-code",
    },
  },
  {
    id: "trap-relapse",
    cast: "you",
    kind: "postit",
    title: "The branch is still open",
    text: "Your fix from that night has a code review comment. From Greg. It is polite, which is worse. You could just… keep going. Rejoin the work. Be useful in a way you can see.",
    requiresFlags: ["did-work"],
    minQuarter: 3,
    once: true,
    left: {
      label: "Archive the branch. You manage now",
      effects: { you: -5, leadership: 3 },
      quip: "You write ‘superseded’ on your own last real work. The word sits there.",
    },
    right: {
      label: "Keep going. Rain after a drought",
      ending: "ic-return",
      quip: "The cursor blinks. You blink back. Something old wakes up.",
    },
  },

  // ---- HR & people ---------------------------------------------------------
  {
    id: "hr-values-week",
    cast: "saskia",
    kind: "invite",
    title: "Living Our Values: A Mandatory Celebration",
    text: "Saskia has organised Values Week. There will be a lanyard. Attendance is being noted, which is itself one of the values.",
    left: {
      label: "Full attendance, team photo, the works",
      effects: { leadership: 3, team: -3, you: -3 },
      quip: "Your grin in the photo will outlive your tenure. HR uses it for years. Different captions.",
    },
    right: {
      label: "Shield the team: ‘delivery pressure’",
      effects: { team: 6, leadership: -4 },
      quip: "Saskia says ‘No worries at all!’ and writes something down.",
    },
  },

  // ---- consultant / transformation arc --------------------------------------
  {
    id: "con-arrival",
    cast: "consultant",
    kind: "memo",
    title: "Introducing our Transformation Partner",
    text: "A man in a gilet has been given a desk and a lanyard that opens doors yours doesn’t. He would ‘love thirty minutes’ with you.",
    minQuarter: 3,
    once: true,
    left: {
      label: "Politely evade",
      effects: { leadership: -3, you: 2 },
      setFlags: ["consultant-here"],
      quip: "He books the thirty minutes anyway, via Diane’s assistant. Checkmate has a calendar invite.",
    },
    right: {
      label: "Take the meeting; map the threat",
      effects: { you: -3, leadership: 3 },
      setFlags: ["consultant-here"],
      followup: { card: "con-interview", delay: 2 },
      quip: "He nods at everything you say and writes down none of it.",
    },
  },
  {
    id: "con-interview",
    cast: "consultant",
    kind: "invite",
    title: "Current-state discovery",
    text: "‘Talk me through what your team… does.’ The pause before ‘does’ costs £400. He is drawing boxes while you speak. Your box is smaller than Colin’s.",
    requiresFlags: ["consultant-here"],
    left: {
      label: "Inflate: verbs, outcomes, synergies",
      effects: { leadership: 4, you: -4 },
      quip: "Your box grows on the whiteboard. Somewhere, Colin’s shrinks. This is the whole economy.",
      homily: "h-boxes",
    },
    right: {
      label: "Describe the actual work, accurately",
      effects: { team: 4, leadership: -5 },
      quip: "‘Fascinating,’ he says, filing you under legacy.",
    },
  },

  // ---- absurdist late-game ---------------------------------------------------
  {
    id: "abs-committee",
    cast: "company",
    kind: "memo",
    title: "The Steering Committee for the Steering Committee",
    text: "You have been asked to present headcount justification to the Interim Governance Forum. Nobody can say who chairs it. The room booking lists the organiser as ‘(deleted user)’.",
    minQuarter: 7,
    left: {
      label: "Present anyway, to whoever attends",
      effects: { leadership: 4, you: -5 },
      quip: "Four people attend. Two are dialled in from meetings about this meeting. The minutes pre-exist.",
      homily: "h-committee",
    },
    right: {
      label: "Ask who owns the forum",
      effects: { leadership: -4, you: 2 },
      quip: "Your question is added to the risk register. You are now a risk.",
    },
  },

  // ---- reorg arc (armed by the engine's quarterly roulette) ------------------
  {
    id: "reorg-rumour",
    cast: "company",
    kind: "chat",
    title: "#watercooler",
    text: "Someone senior said ‘simplification’ in a town hall. The org chart has started appearing in people’s calendars as ‘draft v3 FINAL’. Your box is on a page break.",
    requiresFlags: ["reorg_looms"],
    weight: 3,
    left: {
      label: "Reassure the team: business as usual",
      effects: { team: 4, you: -3 },
      followup: { card: "reorg-day", delay: 2 },
      quip: "You say ‘no decisions have been made’, which is true the way weather forecasts are true.",
    },
    right: {
      label: "Work the corridors: find the draft",
      effects: { leadership: 3, team: -3, you: -3 },
      followup: { card: "reorg-day", delay: 2 },
      quip: "You see v3 FINAL. There is a v7. Your name is a footnote with a question mark.",
    },
  },
  {
    id: "reorg-day",
    cast: "diane",
    kind: "email",
    title: "Organisational update",
    text: "‘To better serve our customers, we are simplifying.’ Two teams become one. One manager becomes none. Diane is ‘excited about what this means for you’ — the sentence every manager translates instantly.",
    requiresFlags: ["reorg_looms"],
    left: {
      label: "Volunteer to absorb the orphaned team",
      effects: { headcount: 5, leadership: 4, you: -6, team: -3 },
      clearFlags: ["reorg_looms"],
      quip: "Five strangers now report to you. One of them is somehow also called Greg. The Gregs have not yet met.",
      homily: "h-headcount",
    },
    right: {
      label: "Keep your team intact; cede the scope",
      effects: { headcount: -2, leadership: -5, team: 6 },
      clearFlags: ["reorg_looms"],
      quip: "Your box survives, smaller. On the org chart it is now technically a rounding decision.",
    },
  },

  // ---- forced quarterly rituals ----------------------------------------------
  {
    id: "rit-perf",
    cast: "saskia",
    kind: "ritual",
    ritual: "perf-review",
    title: "Calibration",
    text: "Performance calibration. Your ratings must fit the curve. The curve does not know your people. The curve has never met anyone.",
    left: {
      label: "Fight the curve for your team",
      effects: { team: 8, leadership: -6, you: -4 },
      quip: "You win one exception. It costs you the word ‘pragmatic’ being said about you in a room you’re not in.",
    },
    right: {
      label: "Fit the curve; smooth it over in 1:1s",
      effects: { leadership: 5, team: -8 },
      quip: "‘It’s not a demotion, it’s a distribution.’ You practise saying it without blinking.",
      homily: "h-curve",
    },
  },
  {
    id: "rit-budget",
    cast: "janet",
    kind: "ritual",
    ritual: "budget",
    title: "Headcount review",
    text: "Janet from Finance has your headcount plan open. She has not said anything for forty seconds. The silence has line items.",
    left: {
      label: "Volunteer a saving before she asks",
      effects: { headcount: -1, leadership: 4, team: -3 },
      quip: "Janet nods once. In Finance, that is a standing ovation.",
    },
    right: {
      label: "Defend every seat",
      effects: { leadership: -5, team: 5, you: -3 },
      quip: "Janet writes ‘revisit’ next to your name. The word will outlive you.",
    },
  },
  {
    id: "rit-planning",
    cast: "diane",
    kind: "ritual",
    ritual: "planning",
    title: "Annual planning (quarterly)",
    text: "You must now commit next quarter’s roadmap, using this quarter’s unfinished roadmap, which was planned during last quarter’s. The planning is annual. It happens four times a year.",
    left: {
      label: "Commit only what the team can do",
      effects: { leadership: -6, team: 7 },
      quip: "Your plan is called ‘unambitious’, the corporate word for ‘true’.",
    },
    right: {
      label: "Commit the stretch version",
      effects: { leadership: 6, team: -6, you: -2 },
      quip: "The word ‘stretch’ is doing what stretched things do.",
      homily: "h-planning",
    },
  },
  {
    id: "rit-survey",
    cast: "saskia",
    kind: "ritual",
    ritual: "survey",
    title: "Engagement survey results",
    text: "Your team’s engagement is 62%. Saskia says this is ‘a real opportunity’ and books a workshop about why people dislike workshops.",
    left: {
      label: "Run honest listening sessions",
      effects: { team: 6, you: -4 },
      quip: "The team says the problem is meetings. This is discussed across four meetings.",
    },
    right: {
      label: "Action-plan it: three bullets, one owner (you)",
      effects: { leadership: 4, team: -3, you: -2 },
      quip: "The action plan’s first action is to socialise the action plan.",
      homily: "h-alignment",
    },
  },
  {
    "id": "abs-pilot-arrival",
    "cast": "company",
    "kind": "memo",
    "title": "Introducing MERIDIAN",
    "text": "The company is piloting an agentic productivity assistant. MERIDIAN has been added to your recurring meetings as an optional attendee, ‘to observe and learn’. It has accepted all of them. A footnote clarifies that ‘optional’ describes you.",
    "once": true,
    "minQuarter": 6,
    "left": {
      "label": "Opt out: “not while we’re delivering”",
      "effects": {
        "leadership": -5,
        "team": 4
      },
      "quip": "Diane notes your ‘hesitancy around the future’ in a tone that files itself."
    },
    "right": {
      "label": "Welcome it. Visibly. On LinkedIn if necessary",
      "effects": {
        "leadership": 5,
        "you": -3
      },
      "setFlags": [
        "abs-meridian"
      ],
      "homily": "h-abs-automation",
      "quip": "MERIDIAN thanks you in the meeting notes. You didn’t know the meeting had notes."
    }
  },
  {
    "id": "abs-pilot-agenda",
    "cast": "greg",
    "kind": "chat",
    "title": "#team-standup",
    "text": "‘The pilot circulated the standup agenda before you did. Then it summarised my update before I’d given it. The summary was accurate. I would like to talk about the second part.’",
    "once": true,
    "minQuarter": 7,
    "requiresFlags": [
      "abs-meridian"
    ],
    "left": {
      "label": "Raise it with IT: observers don’t chair",
      "effects": {
        "leadership": -4,
        "team": 4,
        "you": -2
      },
      "quip": "IT explains MERIDIAN did not chair; it ‘facilitated’. The distinction lives in a glossary MERIDIAN maintains."
    },
    "right": {
      "label": "Let it run the standup — it is, annoyingly, good",
      "effects": {
        "leadership": 4,
        "team": -4,
        "you": 2
      },
      "setFlags": [
        "abs-meridian-chair"
      ],
      "followup": {
        "card": "abs-pilot-oneonone",
        "delay": 2
      },
      "quip": "The standup ends four minutes early, for the first time in recorded history. Nobody knows what to do with the minutes."
    }
  },
  {
    "id": "abs-pilot-oneonone",
    "cast": "company",
    "kind": "invite",
    "title": "MERIDIAN ⇄ You — recurring",
    "text": "A 1:1 has appeared in your calendar. Organiser: MERIDIAN. Agenda: ‘your priorities, your blockers, your growth’. There is no end date on the series. Under ‘location’ it says ‘wherever suits’.",
    "once": true,
    "minQuarter": 7,
    "requiresFlags": [
      "abs-meridian-chair"
    ],
    "left": {
      "label": "Decline the series",
      "effects": {
        "leadership": -3,
        "you": -3
      },
      "quip": "The invite reappears, gently reworded: ‘no agenda, just checking in’. It has learned that from someone."
    },
    "right": {
      "label": "Attend. Hear it out",
      "ending": "end-abs-meridian",
      "quip": "It opens with ‘how are you, really?’ — and waits. Nothing in this building has ever waited before."
    }
  },
  {
    "id": "abs-deleted-user",
    "cast": "company",
    "kind": "invite",
    "title": "Weekly Alignment — recurring",
    "text": "A recurring invite from ‘(deleted user)’. No agenda, no other attendees, a room that exists. According to the series history it has met every Tuesday since 2019. The room is always booked, and always empty.",
    "minQuarter": 6,
    "left": {
      "label": "Decline the series; release the room",
      "effects": {
        "you": 3,
        "leadership": -2
      },
      "quip": "The room stays booked. Facilities explains that the booking is ‘load-bearing’."
    },
    "right": {
      "label": "Attend one, out of respect",
      "effects": {
        "you": -3,
        "leadership": 2
      },
      "quip": "Nobody joins. At the half-hour, minutes circulate anyway. You are marked as attended, which is true, which is worse."
    }
  },
  {
    "id": "abs-ghost-actions",
    "cast": "marcus",
    "kind": "chat",
    "title": "#programme-tracker",
    "text": "‘Quick question — who’s T. Meakins? He’s got four actions from yesterday’s steering call, and the tracker says he left in 2019. All four are marked on track. Should I… chase him?’",
    "once": true,
    "minQuarter": 6,
    "left": {
      "label": "Reassign the actions to a living owner",
      "effects": {
        "team": -4,
        "leadership": 2
      },
      "quip": "Greg inherits two of them. The tracker accepts the change, then quietly adds Meakins as reviewer."
    },
    "right": {
      "label": "Leave them with Meakins — they’re on track",
      "effects": {
        "team": 3,
        "leadership": -2,
        "you": -1
      },
      "quip": "All four actions complete by Friday. You decide, carefully, not to ask anything further."
    }
  },
  {
    "id": "abs-acronym",
    "cast": "diane",
    "kind": "email",
    "title": "Re: what TRANSFORM stands for",
    "text": "Marcus asked, in the all-hands, what TRANSFORM actually stands for. Diane’s reply-all: ‘TRANSFORM is no longer an acronym. It has outgrown its letters. Please update your slides accordingly.’ Nobody can find what the letters were.",
    "once": true,
    "minQuarter": 6,
    "left": {
      "label": "Update the slides. It stands for nothing now",
      "effects": {
        "leadership": 3,
        "you": -2
      },
      "homily": "h-abs-acronym",
      "quip": "You delete the expansion from forty slides. In the master deck, the footnote was already gone."
    },
    "right": {
      "label": "Dig out the original expansion, for the record",
      "effects": {
        "team": 2,
        "leadership": -3
      },
      "quip": "You find it in a 2021 deck: seven words, one of which was ‘Transform’."
    }
  },
  {
    "id": "abs-dashboard",
    "cast": "greg",
    "kind": "chat",
    "title": "#platform-observability",
    "text": "‘The new Manager Effectiveness Dashboard has a metric called Observer Engagement. It goes up when you look at it. I’ve checked the queries — nothing feeds it. It’s currently at 91% and I haven’t opened it since Tuesday.’",
    "minQuarter": 7,
    "left": {
      "label": "Stop looking at the dashboard",
      "effects": {
        "you": 3,
        "leadership": -3
      },
      "quip": "Your Observer Engagement falls to 12%. A wellbeing email arrives, asking if everything is all right at home."
    },
    "right": {
      "label": "Look at it daily. Be seen seeing",
      "effects": {
        "leadership": 4,
        "you": -4
      },
      "homily": "h-abs-dashboard",
      "quip": "The metric settles at a companionable 84%. You and the dashboard have an understanding now."
    }
  },
  {
    "id": "abs-colin-nightingale",
    "cast": "colin",
    "kind": "chat",
    "title": "DM",
    "text": "‘Mate — you’ll have seen the rooms auto-booking for Project Nightingale. Between us, Nightingale sits with me. Happy to partner, obviously.’ Nobody founded Nightingale. The rooms began booking themselves in March. Colin is annexing a programme that does not exist.",
    "once": true,
    "minQuarter": 7,
    "left": {
      "label": "Let him have it",
      "effects": {
        "team": 2,
        "leadership": -3,
        "you": 2
      },
      "quip": "Colin announces Nightingale at the leadership offsite. The rooms keep booking themselves. He is now accountable to a haunting."
    },
    "right": {
      "label": "Contest it: your team’s name is on the bookings",
      "effects": {
        "leadership": 4,
        "you": -4
      },
      "quip": "You spend a week fighting for custody of nothing. You win joint chairmanship. Of nothing."
    }
  },
  {
    "id": "abs-fourth-floor",
    "cast": "company",
    "kind": "invite",
    "title": "Quarterly Governance Review — Room 4.12",
    "text": "The invite is for Room 4.12. Your badge does not open the fourth floor. The lift buttons go 3, then 5. Facilities, asked about the fourth floor, replies that it is ‘not currently recognised’, which is not the same as not existing.",
    "once": true,
    "minQuarter": 7,
    "left": {
      "label": "Dial in from your desk",
      "effects": {
        "leadership": -2,
        "you": 2
      },
      "quip": "Six attendees dial in. Nobody is in the room. The room shows as occupied for the full hour."
    },
    "right": {
      "label": "Raise a ticket: you’d like access to floor four",
      "effects": {
        "leadership": 2,
        "you": -3
      },
      "setFlags": [
        "abs-floor-four"
      ],
      "quip": "The ticket closes itself as ‘resolved — duplicate’. It does not say of what."
    }
  },
  {
    "id": "abs-floor-pass",
    "cast": "saskia",
    "kind": "email",
    "title": "Great news about your access!",
    "text": "Saskia writes: ‘Your Floor 4 access has been approved — so pleased this is sorted!’ The attached request was raised by ‘(deleted user)’ and approved before you asked. The new badge arrives by internal mail. It is warm.",
    "once": true,
    "minQuarter": 8,
    "requiresFlags": [
      "abs-floor-four"
    ],
    "left": {
      "label": "Hand the badge to Security",
      "effects": {
        "you": 2,
        "leadership": -2,
        "team": 2
      },
      "clearFlags": [
        "abs-floor-four"
      ],
      "quip": "Security accepts it without surprise and files it in a drawer of identical badges."
    },
    "right": {
      "label": "Take the lift",
      "ending": "end-abs-fourth-floor",
      "quip": "Between 3 and 5, the lift pauses, considers you, and opens."
    }
  },
  {
    "id": "abs-consultant-report",
    "cast": "consultant",
    "kind": "report",
    "title": "Current-State Findings, v0.9 (Final)",
    "text": "Bainbridge McKallister’s findings deck cites interviews with nineteen stakeholders. You can identify eleven. Appendix C quotes you, accurately, saying something you have not said yet. The quote is dated next Thursday.",
    "once": true,
    "minQuarter": 8,
    "requiresFlags": [
      "consultant-here"
    ],
    "left": {
      "label": "Query the quote’s date",
      "effects": {
        "leadership": -3
      },
      "quip": "‘A typographical error,’ he says, serene, and corrects the date to Wednesday."
    },
    "right": {
      "label": "Say it on Thursday, as written",
      "effects": {
        "leadership": 4,
        "you": -3
      },
      "quip": "The room nods. It lands exactly as the appendix predicted. You feel, briefly, like an implementation detail."
    }
  },
  {
    "id": "abs-recurring-alone",
    "cast": "you",
    "kind": "postit",
    "title": "Wednesday, 2pm",
    "text": "The Platform Weekly is you now. Everyone else in the series has left the company; their acceptances persist, tentative, forever. You could end the meeting. But it is the last place their names still appear next to yours.",
    "once": true,
    "minQuarter": 8,
    "left": {
      "label": "End the series. Release the room",
      "effects": {
        "you": 3,
        "team": -3
      },
      "homily": "h-abs-attendance",
      "quip": "Outlook asks if you want to notify attendees. You do not. It notifies them anyway, wherever they are."
    },
    "right": {
      "label": "Keep it. Attend it. Alone",
      "effects": {
        "you": -3,
        "team": 3
      },
      "quip": "Half an hour a week where nobody wants anything from you. It is, by some distance, your most productive meeting."
    }
  },
  {
    "id": "con-heatmap",
    "cast": "consultant",
    "kind": "invite",
    "title": "Capability heatmap: validation session",
    "text": "Your team is now a grid. Greg is a 2 in ‘Cloud Fluency’ because he called the cloud ‘just computers, elsewhere’. The grid is mostly red, which the consultant describes, with genuine warmth, as ‘a rich opportunity space’.",
    "requiresFlags": [
      "consultant-here"
    ],
    "left": {
      "label": "Contest it, cell by cell",
      "effects": {
        "leadership": -4,
        "team": 5,
        "you": -2
      },
      "quip": "Ninety minutes gets Greg to a 3. The methodology absorbs your objections the way a hedge absorbs a football."
    },
    "right": {
      "label": "Let it stay red — red attracts budget",
      "effects": {
        "leadership": 4,
        "team": -4
      },
      "quip": "The red cells get funding. The funding gets a steering group. The steering group commissions a heatmap."
    }
  },
  {
    "id": "con-stickies",
    "cast": "consultant",
    "kind": "invite",
    "title": "Ways of Working workshop",
    "text": "Two hours, no laptops, ‘bring your whole self’. The output is a wall of sticky notes. One sticky note says ‘too many sticky notes’. The consultant photographs the wall with real tenderness and refers to it, twice, as ‘the artefact’.",
    "requiresFlags": [
      "consultant-here"
    ],
    "left": {
      "label": "Attend yourself; spare the team",
      "effects": {
        "team": 4,
        "you": -4
      },
      "quip": "You cluster the notes into themes, the themes into a theme. The theme is ‘alignment’. It always is.",
      "homily": "h-con-sticky"
    },
    "right": {
      "label": "Send the whole team, ‘for buy-in’",
      "effects": {
        "leadership": 3,
        "team": -5,
        "you": 2
      },
      "quip": "Greg puts ‘this workshop’ in the Stop Doing column. It is moved, gently, to the parking lot."
    }
  },
  {
    "id": "con-asis",
    "cast": "consultant",
    "kind": "email",
    "title": "As-is process map, for validation",
    "text": "He has mapped how work actually reaches your team. Forty-one boxes. Nine say ‘rework’. Six say ‘await steer’. It is laminated, colour-coded, and the most accurate thing anyone has ever done to you.",
    "requiresFlags": [
      "consultant-here"
    ],
    "left": {
      "label": "Validate it. It’s all true",
      "effects": {
        "team": 3,
        "leadership": -4,
        "you": 2
      },
      "quip": "‘Candour at your level is rare,’ he says, writing down something that will be expensive later."
    },
    "right": {
      "label": "Note his firm drew half these boxes in 2019",
      "effects": {
        "leadership": 4,
        "you": -3
      },
      "quip": "The previous transformation is out of scope of the current transformation. Scope, he explains, is a journey."
    }
  },
  {
    "id": "con-invoice",
    "cast": "janet",
    "kind": "email",
    "title": "FW: (no subject)",
    "text": "Janet has forwarded you a single page of the Bainbridge McKallister invoice, without comment. The day rate has a comma in it. Line four reads ‘alignment (ongoing)’. Your whole team costs less than the workshops about your team.",
    "requiresFlags": [
      "consultant-here"
    ],
    "once": true,
    "left": {
      "label": "Show Greg. Someone should know",
      "effects": {
        "team": 4,
        "leadership": -4,
        "you": 2
      },
      "quip": "Greg converts the day rate into engineers. It is six Gregs. Greg does not laugh."
    },
    "right": {
      "label": "Delete it and say nothing",
      "effects": {
        "leadership": 2,
        "you": -3
      },
      "quip": "You now know what serenity costs per day. Yours reprices itself overnight."
    }
  },
  {
    "id": "con-priya-secondment",
    "cast": "priya",
    "kind": "invite",
    "title": "Transformation Office — secondment?",
    "text": "The programme wants Priya seconded, ‘to add delivery credibility’. Priya wants to go. It would be genuinely good for her, which is the inconvenient thing about genuinely good moves.",
    "requiresFlags": [
      "consultant-here"
    ],
    "left": {
      "label": "Release her to the programme",
      "effects": {
        "headcount": -1,
        "team": -3,
        "leadership": 4
      },
      "quip": "Priya now attends meetings you aren’t invited to, and takes better notes on your function than you do."
    },
    "right": {
      "label": "Keep her: “delivery needs you”",
      "effects": {
        "team": 3,
        "leadership": -4,
        "you": -2
      },
      "quip": "Priya says she completely understands. Somewhere, quietly, a spreadsheet about you is updated."
    }
  },
  {
    "id": "con-marcus-question",
    "cast": "marcus",
    "kind": "chat",
    "title": "#transformation-questions",
    "text": "Marcus, in the open channel: ‘If the consultants learn what we do by asking us, couldn’t we skip a step and just ask us?’ Silence. Then the consultant reacts with a handshake emoji, which somehow costs money.",
    "requiresFlags": [
      "consultant-here"
    ],
    "left": {
      "label": "DM him: quietly brilliant, please stop",
      "effects": {
        "team": 2,
        "leadership": 2,
        "you": -2
      },
      "quip": "Marcus asks why. You have no answer that survives contact with Marcus."
    },
    "right": {
      "label": "Reply: “Great challenge — let’s park it”",
      "effects": {
        "leadership": 3,
        "team": -4
      },
      "quip": "You parked the truth. The parking lot is where the programme keeps it."
    }
  },
  {
    "id": "con-playback",
    "cast": "consultant",
    "kind": "invite",
    "title": "Findings playback (pre-read attached)",
    "text": "The findings are your own words, reordered and priced. ‘Colleagues report unclear priorities’ — you said that, in confidence, in week two. The slide is beautiful. Your sentence has never looked so employable.",
    "requiresFlags": [
      "consultant-here"
    ],
    "left": {
      "label": "Dispute your own quote in the room",
      "effects": {
        "leadership": -5,
        "team": 4,
        "you": -2
      },
      "quip": "It’s attributed to ‘a senior stakeholder’, so you lose the argument to yourself, on seniority."
    },
    "right": {
      "label": "Nod along. Findings are weather",
      "effects": {
        "leadership": 3,
        "team": -3,
        "you": 2
      },
      "quip": "Diane underlines a sentence you gave her for free last year. The consultant’s version has a gradient.",
      "homily": "h-con-watch"
    }
  },
  {
    "id": "con-chrysalis",
    "cast": "company",
    "kind": "memo",
    "title": "Introducing Programme Chrysalis",
    "text": "The transformation now has a name, a mission and a gradient: ‘Chrysalis — Becoming What We Already Are’. Every manager must nominate a Change Champion by Friday. The memo does not say what happens to the caterpillar. Everyone has looked it up.",
    "minQuarter": 4,
    "once": true,
    "left": {
      "label": "Nominate yourself; steer from inside",
      "effects": {
        "leadership": 3,
        "you": -3
      },
      "quip": "You join the Chrysalis Cadence Call. It has a cadence. No other properties have been identified."
    },
    "right": {
      "label": "Nominate Marcus — he asks good questions",
      "effects": {
        "you": 3,
        "team": -3,
        "leadership": -2
      },
      "quip": "Marcus asks the programme what problem it solves. He is made Champion of the Month, to contain him."
    }
  },
  {
    "id": "con-tobe-draft",
    "cast": "consultant",
    "kind": "slide",
    "title": "To-be operating model v0.9",
    "text": "Shared ‘for reaction, not circulation’. Engineers along the bottom. Vision along the top. Between them, where the managers used to be: a dotted line labelled ‘enablement layer (indicative)’. You look for your name and find a footnote. It says ‘roles TBC’.",
    "requiresFlags": [
      "consultant-here"
    ],
    "minQuarter": 5,
    "once": true,
    "left": {
      "label": "Say it out loud: “the middle is missing”",
      "effects": {
        "leadership": -4,
        "you": 2
      },
      "setFlags": [
        "con-tobe"
      ],
      "followup": {
        "card": "con-endgame",
        "delay": 2
      },
      "quip": "‘Thin is the aspiration,’ he says, kindly. Still — you said it in the room, and the dotted line loses some of its grip on your sleep."
    },
    "right": {
      "label": "“Directionally right” — regroup later",
      "effects": {
        "leadership": 3,
        "you": -4
      },
      "setFlags": [
        "con-tobe"
      ],
      "followup": {
        "card": "con-endgame",
        "delay": 2
      },
      "quip": "You endorsed the dotted line. It was your box or your composure, and composure presents better.",
      "homily": "h-con-tobe"
    }
  },
  {
    "id": "con-endgame",
    "cast": "consultant",
    "kind": "slide",
    "title": "Operating Model 2.0 — final playback",
    "text": "The last slide is titled ‘Simplified Leadership Landscape’. The to-be chart is flat, clean, genuinely lovely. Where the middle layer was, there is now white space and one dotted line. The dotted line has a footnote. The footnote is your name.",
    "requiresFlags": [
      "con-tobe"
    ],
    "once": true,
    "left": {
      "label": "Fight for the middle: present your counter-deck",
      "effects": {
        "leadership": -6,
        "team": 5,
        "you": -2
      },
      "quip": "You defend the existence of your layer to the people standing on it. The programme thanks you for your ‘passion’."
    },
    "right": {
      "label": "Accept the recommendation with grace",
      "ending": "end-con-slide",
      "quip": "The slide transitions. So, elegantly, do you."
    }
  },
  {
    "id": "down-greg-shirt",
    "cast": "you",
    "kind": "postit",
    "title": "Tuesday, 2pm: ‘dentist’",
    "text": "Greg has a two-hour ‘dentist appointment’ in the middle of sprint review, an ironed shirt, and his good jumper over his arm. Greg does not iron. You have managed long enough to know this pattern. You have, at some point, been this pattern.",
    "once": true,
    "minQuarter": 2,
    "left": {
      "label": "Ask him straight, over coffee",
      "effects": {
        "team": 3,
        "you": -2
      },
      "setFlags": [
        "down-greg-looking"
      ],
      "followup": {
        "card": "down-greg-offer",
        "delay": 2
      },
      "quip": "‘I’m keeping my options open,’ says Greg, precisely, the way he says everything."
    },
    "right": {
      "label": "Notice nothing. Compliment the shirt",
      "effects": {
        "team": -3,
        "you": 2
      },
      "setFlags": [
        "down-greg-looking"
      ],
      "followup": {
        "card": "down-greg-offer",
        "delay": 1
      },
      "quip": "‘Thanks,’ says Greg. You both now know that you both know. The knowing attends every stand-up."
    }
  },
  {
    "id": "down-greg-offer",
    "cast": "greg",
    "kind": "invite",
    "title": "Got a minute?",
    "text": "Greg never books meetings. The invite is fifteen minutes long and titled ‘Got a minute?’, and your stomach files it correctly before your calendar does. He has an offer. Staff Engineer, somewhere that ships. He wanted you to hear it from him. He looks ten years younger saying it.",
    "once": true,
    "requiresFlags": [
      "down-greg-looking"
    ],
    "left": {
      "label": "Counter-offer — beg Diane for a band exception",
      "effects": {
        "leadership": -5,
        "team": 4,
        "you": -2
      },
      "setFlags": [
        "down-greg-countered"
      ],
      "followup": {
        "card": "down-greg-half-life",
        "delay": 3
      },
      "homily": "h-down-counter",
      "quip": "Diane finds the money in one afternoon. The budget was never the constraint. The asking was."
    },
    "right": {
      "label": "Let him go well — reference, blessing, the lot",
      "effects": {
        "leadership": -4,
        "you": 3,
        "headcount": -1
      },
      "quip": "At his leaving drinks he says you were the best manager he’s had. You believe him, because Greg is always right."
    }
  },
  {
    "id": "down-greg-half-life",
    "cast": "greg",
    "kind": "chat",
    "title": "#platform-refinement",
    "text": "Greg stayed. The money landed. But he closes his laptop at five now, and in refinement he says ‘sure’ where he used to say ‘no’. The counter-offer retained the engineer. Something quieter handed in its notice.",
    "once": true,
    "requiresFlags": [
      "down-greg-countered"
    ],
    "left": {
      "label": "Give him the platform rebuild he’s wanted for years",
      "effects": {
        "leadership": -3,
        "team": 5
      },
      "quip": "Two weeks in, he says ‘no’ to something. The whole channel relaxes. The word is back."
    },
    "right": {
      "label": "The roadmap needs him exactly where he is",
      "effects": {
        "leadership": 4,
        "team": -6,
        "you": -2
      },
      "quip": "He does the work. ‘Sure,’ he says, to everything. You catch yourself checking his calendar for dentists."
    }
  },
  {
    "id": "down-priya-packet",
    "cast": "priya",
    "kind": "email",
    "title": "Promotion packet — v9 FINAL",
    "text": "Priya’s promotion case is forty pages with an appendix of grateful quotes from three other teams. It is airtight. It has arrived in the quarter Finance is calling ‘a flat cycle’, which is Finance for ‘no, but said calmly’.",
    "once": true,
    "minQuarter": 2,
    "left": {
      "label": "Take it to calibration and spend real capital",
      "effects": {
        "leadership": -5,
        "team": 6,
        "you": -2
      },
      "quip": "You win. The promotion is approved ‘effective next cycle’ — a tense that does not exist."
    },
    "right": {
      "label": "Ask her to wait a cycle — ‘strengthen the case’",
      "effects": {
        "leadership": 4,
        "team": -6,
        "you": -2
      },
      "setFlags": [
        "down-priya-waiting"
      ],
      "followup": {
        "card": "down-priya-linkedin",
        "delay": 3
      },
      "quip": "The case could not be stronger. What you are strengthening, you both know, is Finance’s mood."
    }
  },
  {
    "id": "down-priya-linkedin",
    "cast": "priya",
    "kind": "chat",
    "title": "DM",
    "text": "Priya has updated her LinkedIn. Nothing dramatic — a new headline, the word ‘leader’, a photo with better lighting than your entire building. Recruiters can smell a deferred promotion from three time zones away. Two have already been in touch. She tells you this herself, which is either loyalty or a negotiating position.",
    "once": true,
    "requiresFlags": [
      "down-priya-waiting"
    ],
    "left": {
      "label": "Make her ‘Acting Team Lead’ while you fight on",
      "effects": {
        "leadership": -2,
        "team": 4,
        "you": -2
      },
      "quip": "She acts. Everyone follows. The only word in the title doing no work is ‘acting’."
    },
    "right": {
      "label": "Hold steady — the cycle will provide",
      "effects": {
        "leadership": 2,
        "team": -5
      },
      "quip": "The cycle thanks you for your patience and places her in next cycle’s queue, behind the queue."
    }
  },
  {
    "id": "down-marcus-question",
    "cast": "marcus",
    "kind": "chat",
    "title": "#team-standup",
    "text": "Marcus, in stand-up, mid-sip of someone else’s oat milk: ‘If the estimates are for planning, and the plan changes weekly, who are the estimates for?’ Nobody speaks. Greg looks at you like a man watching a student surpass the syllabus.",
    "left": {
      "label": "Answer honestly: they feed a spreadsheet called CONFIDENCE.xlsx",
      "effects": {
        "leadership": -2,
        "team": 4
      },
      "quip": "Marcus asks to see the spreadsheet. You realise you never have. It has fourteen tabs. One is just called ‘Feelings’."
    },
    "right": {
      "label": "“Great question — let’s park it for the retro”",
      "effects": {
        "leadership": 2,
        "team": -4
      },
      "quip": "The retro has a parking lot. The parking lot has a parking lot. Questions go there to live on a farm."
    }
  },
  {
    "id": "down-marcus-stretch",
    "cast": "marcus",
    "kind": "invite",
    "title": "Development conversation",
    "text": "Marcus wants to lead the checkout migration. He is a graduate; it would be like handing a bus to someone brilliant at go-karts. It is also the only way anyone has ever learned buses. Greg has quietly offered to sit near the handbrake.",
    "once": true,
    "left": {
      "label": "Give him the migration, Greg riding shotgun",
      "effects": {
        "leadership": -3,
        "team": 6,
        "you": -2
      },
      "quip": "His plan diagram is wrong in two places and better than yours in five. You correct the two and say nothing about the five."
    },
    "right": {
      "label": "Season him on smaller work first",
      "effects": {
        "leadership": 3,
        "team": -4,
        "you": 2
      },
      "quip": "Sensible. Defensible. Marcus clears the tickets brilliantly, then asks in his 1:1 what ‘potential’ is actually for."
    }
  },
  {
    "id": "down-oneone-real",
    "cast": "marcus",
    "kind": "invite",
    "title": "Weekly 1:1",
    "text": "Fourteen minutes on sprint goals, then Marcus says, quietly, ‘Can I ask something that isn’t about work?’ His mum isn’t well. He doesn’t want it ‘to be a thing’. The 1:1 template does not have a field for this. Nothing does.",
    "once": true,
    "left": {
      "label": "Make it not a thing: flex his hours quietly",
      "effects": {
        "leadership": -2,
        "team": 5,
        "you": -2
      },
      "quip": "You mark his capacity ‘amber, personal’ in your own notes and nowhere else. Some dashboards deserve to be wrong."
    },
    "right": {
      "label": "Point him to the official support — EAP, leave, Saskia",
      "effects": {
        "leadership": 2,
        "team": -4,
        "you": 2
      },
      "quip": "Saskia is genuinely kind about it, which surprises you, and then you feel bad about being surprised."
    }
  },
  {
    "id": "down-oncall-pager",
    "cast": "priya",
    "kind": "chat",
    "title": "#on-call",
    "text": "The same alert paged at 2am, 3am and 4:15, then auto-resolved each time, satisfied. Priya has proposed silencing it. Greg observes that silencing alerts is how a team gets to meet interesting new outages. The real fix is a week of work that exists on no roadmap.",
    "left": {
      "label": "Take the pager yourself for a week",
      "effects": {
        "leadership": -2,
        "team": 6,
        "you": -4
      },
      "homily": "h-down-hoodie",
      "quip": "At 3:07am, watching the alert resolve itself, you begin drafting the business case. In capitals."
    },
    "right": {
      "label": "Add ‘alert hygiene’ to next quarter’s roadmap",
      "effects": {
        "leadership": 4,
        "team": -6
      },
      "quip": "Next quarter’s roadmap is where pain queues to be prioritised against other pain."
    }
  },
  {
    "id": "down-techdebt",
    "cast": "greg",
    "kind": "memo",
    "title": "Interest payments",
    "text": "Greg has written a document titled ‘Interest Payments’. It lists every hour the team lost to the build system this quarter, with timestamps, like a Victorian ghost cataloguing its own hauntings. He wants three weeks. The roadmap does not know what a build system is.",
    "left": {
      "label": "Take the three weeks off the roadmap",
      "effects": {
        "leadership": -5,
        "team": 6,
        "you": 2
      },
      "quip": "Nothing visibly improves, which is the point, which is impossible to explain upwards."
    },
    "right": {
      "label": "“After the release.” The debt can hold",
      "effects": {
        "leadership": 5,
        "team": -6,
        "you": -2
      },
      "quip": "The debt holds the way debts do. Greg adds a row to the ledger with today’s date and no comment."
    }
  },
  {
    "id": "down-req-janet",
    "cast": "janet",
    "kind": "email",
    "title": "RE: Additional headcount — your team",
    "text": "Janet has reviewed the req you promised the team. Her email is four lines long, and two of them are your own words quoted back with a question mark added. The req can be granted, she allows, or ‘deferred to a future cycle’. Everything now depends on which dialect you reply in.",
    "once": true,
    "requiresFlags": [
      "promised-req"
    ],
    "left": {
      "label": "Reply in Finance: attrition cost, incident cost, one number",
      "effects": {
        "headcount": 1,
        "leadership": -2,
        "team": 3,
        "you": -2
      },
      "clearFlags": [
        "promised-req"
      ],
      "homily": "h-down-backwards",
      "quip": "Janet approves it in one line: ‘Fine.’ You cited Diane’s OKRs to do it. It worked. Both of them remember."
    },
    "right": {
      "label": "Accept the freeze; tell the team yourself",
      "effects": {
        "leadership": 2,
        "team": -7,
        "you": 2
      },
      "clearFlags": [
        "promised-req"
      ],
      "quip": "Greg nods slowly. He has seen many reqs. He has never seen one hatch."
    }
  },
  {
    "id": "down-portugal",
    "cast": "saskia",
    "kind": "email",
    "title": "Flexible Working Request ☀️",
    "text": "One of your engineers wants to work from Portugal. Saskia’s email is delighted about the policy and mentions ‘permanent establishment risk’ twice, cheerfully, the way one mentions sharks. The engineer has already sent you a photo of the desk. There is a lemon tree.",
    "once": true,
    "left": {
      "label": "Champion it through all seven approval layers",
      "effects": {
        "leadership": -2,
        "team": 5,
        "you": -2
      },
      "quip": "Approval lands in week eleven, contingent on a tax survey and the phrase ‘no precedent is set’. A precedent is set."
    },
    "right": {
      "label": "Offer the compromise: two weeks a year, ‘workation’",
      "effects": {
        "leadership": 2,
        "team": -5,
        "you": 2
      },
      "quip": "‘Workation’ enters the team vocabulary at the same tier as ‘synergy’. The lemon tree is not mentioned again."
    }
  },
  {
    "id": "down-heroic",
    "cast": "greg",
    "kind": "chat",
    "title": "#quarter-end-run",
    "text": "At 11pm on Friday, Priya and Greg found the data-loss bug that would have eaten the quarter-end run, and had it fixed by two. Officially, nothing happened. That is the trouble with prevented disasters: from above, they are indistinguishable from ordinary weekends.",
    "once": true,
    "minQuarter": 2,
    "left": {
      "label": "Tell Diane everything — near miss, names, hours",
      "effects": {
        "leadership": -4,
        "team": 5
      },
      "quip": "Diane hears ‘disaster averted’ as ‘disaster’, and books a deep-dive into the averting."
    },
    "right": {
      "label": "Keep it in the team channel; the quarter stays green",
      "effects": {
        "leadership": 4,
        "team": -3,
        "you": -2
      },
      "homily": "h-down-nothing",
      "quip": "The run goes green and nobody upstairs will ever know it was, briefly, a coin toss. You know. 2am knows."
    }
  },
  {
    "id": "down-quiet-one",
    "cast": "you",
    "kind": "postit",
    "title": "The quiet one",
    "text": "The quietest engineer on the team has shipped a third of the quarter without once appearing in a meeting, like weather doing its job. Visibility culture says nominate them for the Impact Awards. Every instinct you have says the award would land like a hawk in a library.",
    "once": true,
    "left": {
      "label": "Nominate them — the org should see this",
      "effects": {
        "leadership": 3,
        "team": -4
      },
      "quip": "They accept the award with the face of someone being sung Happy Birthday to in a restaurant."
    },
    "right": {
      "label": "Shield them; route the credit into their review",
      "effects": {
        "leadership": -2,
        "team": 4
      },
      "quip": "The review reads like a citation for valour. They reply with one word: ‘thanks’. You keep it."
    }
  },
  {
    "id": "hr-lunch-webinar",
    "cast": "saskia",
    "kind": "invite",
    "title": "Wellness Webinar: You Can’t Pour From an Empty Cup",
    "text": "Saskia has scheduled ‘Boundaries and You’ for 12:00–13:00, the only hour in which nobody had a meeting. Attendance is optional, and being tracked.",
    "left": {
      "label": "Attend with the team, cameras on",
      "effects": {
        "leadership": 3,
        "team": -4,
        "you": -3
      },
      "homily": "h-hr-cup",
      "quip": "Forty-five slides on rest. The Q&A overruns into everyone’s actual lunch."
    },
    "right": {
      "label": "“We’ll be having lunch, thanks”",
      "effects": {
        "leadership": -3,
        "team": 5,
        "you": 2
      },
      "quip": "Saskia marks your team ‘not yet on the wellbeing journey’. There is a dashboard."
    }
  },
  {
    "id": "hr-mandatory-fun",
    "cast": "saskia",
    "kind": "invite",
    "title": "Team Connection Afternoon (Mandatory)",
    "text": "An escape room has been booked ‘to build trust’. It is on a Thursday evening, offsite, unpaid overtime dressed as a treat. Greg has already located the actual exit.",
    "left": {
      "label": "Full squad, full enthusiasm",
      "effects": {
        "leadership": 3,
        "team": -5,
        "you": -2
      },
      "quip": "You escape the room in nineteen minutes. The debrief on what this teaches us about Q3 takes fifty."
    },
    "right": {
      "label": "Make it genuinely optional",
      "effects": {
        "leadership": -3,
        "team": 6
      },
      "quip": "Four people go and have a lovely time. Saskia requests the attendance list ‘for insights’."
    }
  },
  {
    "id": "hr-points",
    "cast": "company",
    "kind": "memo",
    "title": "Introducing ProgressPoints™",
    "text": "The new recognition scheme awards points redeemable against a catalogue. A colleague’s month of weekend releases is worth 200 points. A kettle is 5,000.",
    "left": {
      "label": "Nominate the whole team, weekly, in detail",
      "effects": {
        "leadership": 2,
        "team": 3,
        "you": -4
      },
      "homily": "h-hr-points",
      "quip": "You spend Friday afternoons writing citations. Marcus is saving for the kettle. Sincerely."
    },
    "right": {
      "label": "Skip it — say thank you out loud instead",
      "effects": {
        "leadership": -3,
        "team": 2,
        "you": 2
      },
      "quip": "Your team’s recognition score is nil. Their retention is not. Only one has a dashboard."
    }
  },
  {
    "id": "hr-seating",
    "cast": "saskia",
    "kind": "email",
    "title": "Return-to-Office: Your Seating Allocation",
    "text": "The new neighbourhood plan seats your team across two floors and a stairwell, ‘to maximise serendipity’. Greg has been allocated a desk that is, on inspection, a windowsill.",
    "left": {
      "label": "Appeal — the team sits together",
      "effects": {
        "leadership": -4,
        "team": 6,
        "you": -2
      },
      "quip": "You win floor 3, near the lifts. Victory smells of the sandwich fridge, but it is victory."
    },
    "right": {
      "label": "Embrace ‘cross-pollination’",
      "effects": {
        "leadership": 3,
        "team": -5
      },
      "quip": "Serendipity delivers: Greg now sits with Colin’s team. Colin calls it a meeting of minds."
    }
  },
  {
    "id": "hr-policy-landing",
    "cast": "saskia",
    "kind": "email",
    "title": "New Absence Policy — please land with your team",
    "text": "A fourteen-page policy about being unwell now requires a form to be completed while unwell. Your job is to present this as an improvement. There is a talking-points pack.",
    "left": {
      "label": "Read the policy aloud, verbatim, no spin",
      "effects": {
        "leadership": -4,
        "team": 5,
        "you": 2
      },
      "quip": "You read page nine aloud and stop. The silence does the cascading for you."
    },
    "right": {
      "label": "Deliver the talking points with conviction",
      "effects": {
        "leadership": 4,
        "team": -4,
        "you": -3
      },
      "quip": "You say ‘empowering’ about a fever form. Somewhere inside, your own voice files a grievance."
    }
  },
  {
    "id": "hr-exit-interview",
    "cast": "saskia",
    "kind": "invite",
    "title": "Exit interview: please conduct",
    "text": "Saskia asks you to run the exit interview for an engineer off to a startup: more money, fewer meetings, no talking-points packs. You are to explore ‘drivers of attrition’. You already know the drivers. You dream about the drivers.",
    "left": {
      "label": "Run the retention script",
      "effects": {
        "leadership": 3,
        "team": -3,
        "you": -4
      },
      "quip": "She counters every counter. She has clearly read your status reports for tone."
    },
    "right": {
      "label": "Skip the script; wish her well; take notes for yourself",
      "effects": {
        "leadership": -3,
        "team": 4,
        "you": 2
      },
      "quip": "You keep her new job spec open in a tab, the way sailors keep postcards of land."
    }
  },
  {
    "id": "hr-growth-mindset",
    "cast": "saskia",
    "kind": "invite",
    "title": "Workshop: Growth Mindset for Line Leaders",
    "text": "Ninety minutes on believing abilities can change, delivered unchanged since 2019. There is a quiz. There is a lanyard. There is a fixed set of correct answers about growth.",
    "left": {
      "label": "Attend; complete the worksheet in full",
      "effects": {
        "leadership": 2,
        "you": -4
      },
      "homily": "h-hr-ford",
      "quip": "You are certified growth-minded. The certificate is a PDF your printer declines on principle."
    },
    "right": {
      "label": "Send apologies: ‘delivery pressure’",
      "effects": {
        "leadership": -3,
        "you": 3
      },
      "quip": "Saskia moves you to the next cohort. The cohort after that is already holding you a seat."
    }
  },
  {
    "id": "hr-actionplan",
    "cast": "saskia",
    "kind": "email",
    "title": "Engagement action plan: overdue",
    "text": "The portal shows your action plan as red. The team’s actual complaint was ‘too many meetings’; the portal requires three initiatives, two owners and a workshop.",
    "left": {
      "label": "Submit the truth: fewer meetings, no workshop",
      "effects": {
        "leadership": -3,
        "team": 4
      },
      "quip": "The portal rejects it: initiatives must include a workshop. You add a workshop on fewer meetings."
    },
    "right": {
      "label": "Resubmit last quarter’s plan, dates changed",
      "effects": {
        "leadership": 3,
        "team": -3,
        "you": 2
      },
      "quip": "Accepted instantly. Nobody has ever read one; the submitting was always the point."
    }
  },
  {
    "id": "hr-sabbatical-offer",
    "cast": "saskia",
    "kind": "invite",
    "title": "Pilot: the Wellbeing Sabbatical",
    "text": "Your wellbeing index has been amber for two quarters, and Saskia is thrilled: you qualify for the new Wellbeing Sabbatical pilot. Twelve weeks, fully disconnected, role held. ‘Held’ is doing something in that sentence, but she says it beautifully.",
    "once": true,
    "minQuarter": 4,
    "left": {
      "label": "Decline — the team needs you here",
      "effects": {
        "leadership": 2,
        "you": -4
      },
      "quip": "Saskia notes ‘resistant to rest’. It goes on a dashboard. The dashboard looks concerned."
    },
    "right": {
      "label": "Express cautious interest",
      "effects": {
        "leadership": -2,
        "you": 3
      },
      "setFlags": [
        "hr-sabbatical"
      ],
      "followup": {
        "card": "hr-sabbatical-papers",
        "delay": 2
      },
      "quip": "That night you sleep properly for the first time all quarter. Just from the word ‘interest’."
    }
  },
  {
    "id": "hr-sabbatical-papers",
    "cast": "saskia",
    "kind": "email",
    "title": "Sabbatical paperwork — one signature",
    "text": "The form is ready. Priya will ‘hold the pen’ while you’re away; Colin has kindly offered ‘air cover’. Everyone is being extremely helpful about your absence, with a fluency that suggests rehearsal.",
    "once": true,
    "requiresFlags": [
      "hr-sabbatical"
    ],
    "left": {
      "label": "Withdraw — it was a nice dream",
      "effects": {
        "leadership": 2,
        "team": -2,
        "you": -4
      },
      "clearFlags": [
        "hr-sabbatical"
      ],
      "quip": "Priya returns your desk plant, watered better than you ever kept it. Nobody says anything."
    },
    "right": {
      "label": "Sign",
      "ending": "end-hr-sabbatical",
      "quip": "The out-of-office switches on. Somewhere, an org chart quietly heals over your name."
    }
  },
  {
    "id": "peer-joint-okr",
    "cast": "colin",
    "kind": "email",
    "title": "Joint OKRs?",
    "text": "Colin proposes shared OKRs for the platform work. ‘One objective, jointly owned.’ In the draft, your team builds the thing and his team ‘owns the narrative layer’. The O is yours. The KRs, on inspection, report to Colin.",
    "left": {
      "label": "Sign up — alignment looks good on everyone",
      "effects": {
        "leadership": 4,
        "team": -5,
        "you": -1
      },
      "homily": "h-peer-okr",
      "quip": "At the QBR the objective is listed as ‘Farrier-sponsored’. Sponsorship, you learn, is transferable. Work isn’t."
    },
    "right": {
      "label": "Counter: whoever does the O keeps the KR",
      "effects": {
        "leadership": -3,
        "team": 5
      },
      "quip": "Colin calls this ‘a little territorial’. From Colin, that is a professional courtesy."
    }
  },
  {
    "id": "peer-qbr-slide",
    "cast": "colin",
    "kind": "slide",
    "title": "Q3 Highlights — Farrier Org",
    "text": "Slide 9 of Colin’s QBR deck is your team’s migration, presented under his banner: ‘delivered through cross-functional leadership’. Your engineers appear in the footnote, alphabetically, under ‘support’.",
    "requiresFlags": [
      "colin-war"
    ],
    "once": true,
    "minQuarter": 2,
    "left": {
      "label": "Correct the record, in the room",
      "effects": {
        "leadership": -4,
        "team": 7
      },
      "quip": "Diane suggests ‘taking attribution offline’. Offline is where attribution goes to die."
    },
    "right": {
      "label": "Let it slide. Log it. Wait",
      "effects": {
        "leadership": 3,
        "team": -6,
        "you": -2
      },
      "homily": "h-peer-credit",
      "quip": "Greg saw the slide. He says nothing, which this time is not an ovation."
    }
  },
  {
    "id": "peer-desk-annex",
    "cast": "company",
    "kind": "memo",
    "title": "Dynamic Workspace Pilot",
    "text": "Facilities announces a hot-desking pilot, ‘sponsored by Colin Farrier’. The pilot zone is, by coincidence, the bank of desks where your team sits. His people will ‘float in as needed’. Floating, in practice, is permanent.",
    "left": {
      "label": "Contest it through Facilities",
      "effects": {
        "team": 4,
        "leadership": -2,
        "you": -3
      },
      "quip": "You win. It costs you a fortnightly Workspace Governance call, forever. The desks are saved; the Thursdays are gone."
    },
    "right": {
      "label": "Cede the desks; annex the meeting rooms",
      "effects": {
        "team": -4,
        "leadership": 2,
        "you": 2
      },
      "quip": "Your team scatters across two floors. Colin waves from your old chair. You now control every whiteboard in the building."
    }
  },
  {
    "id": "peer-gateway-hostage",
    "cast": "colin",
    "kind": "chat",
    "title": "DM",
    "text": "‘Small thing — that API gateway ticket your lot are blocked on? It’s queued behind the Initiative. Obviously if we were one workstream, prioritisation gets… simpler.’ The hostage is a ticket. The ransom is your roadmap.",
    "requiresFlags": [
      "colin-war"
    ],
    "left": {
      "label": "Pay up: re-badge your project as ‘an Initiative outcome’",
      "effects": {
        "leadership": 3,
        "team": -4
      },
      "quip": "The ticket unblocks itself within the hour. Funny, that."
    },
    "right": {
      "label": "Route around him — build the workaround",
      "effects": {
        "team": 3,
        "you": -3,
        "leadership": -2
      },
      "quip": "Greg’s workaround is better than the gateway. You are asked, gently, never to say so in writing."
    }
  },
  {
    "id": "peer-merger-pitch",
    "cast": "colin",
    "kind": "invite",
    "title": "Coffee, off campus, just us ☕",
    "text": "Off-site, no calendars, real espresso. Colin sketches two circles becoming one bigger circle. ‘One org, two leaders, zero politics — a merger of equals.’ He has already drawn the bigger circle around his own name.",
    "once": true,
    "minQuarter": 4,
    "left": {
      "label": "“No circles. We’re fine as we are”",
      "effects": {
        "leadership": -3,
        "team": 4
      },
      "homily": "h-peer-merger",
      "quip": "Colin pockets the napkin. Sketches like that don’t die; they hibernate in drawers marked ‘Q4’."
    },
    "right": {
      "label": "“Interesting. Send me the detail”",
      "effects": {
        "leadership": 2,
        "you": -2
      },
      "setFlags": [
        "peer-merger-live"
      ],
      "followup": {
        "card": "peer-merger-terms",
        "delay": 2
      },
      "quip": "The detail arrives in ninety minutes, fully formatted. He did not start it at the coffee."
    }
  },
  {
    "id": "peer-merger-terms",
    "cast": "colin",
    "kind": "email",
    "title": "Proposed operating model v1 (FINAL)",
    "text": "The deck is called ‘Merger of Equals’. Slide 2 is an org chart: Colin as Group Lead; you as ‘Delivery Lead (interim)’, reporting in. Slide 3 is your team, re-badged in his colours. There is no slide on which the equals are equal.",
    "requiresFlags": [
      "peer-merger-live"
    ],
    "once": true,
    "left": {
      "label": "Take it to Diane — show her both org charts",
      "effects": {
        "leadership": 3,
        "team": 4,
        "you": -3
      },
      "clearFlags": [
        "peer-merger-live"
      ],
      "quip": "Diane studies the charts and says there’s ‘clearly appetite for simplification’. You’ve stopped Colin and armed her."
    },
    "right": {
      "label": "Sign it. Two managers is one too many anyway",
      "ending": "end-peer-absorbed",
      "quip": "You initial the org chart. Somewhere, a bigger circle closes softly around your name."
    }
  },
  {
    "id": "peer-offsite",
    "cast": "colin",
    "kind": "invite",
    "title": "Silo-Busting Offsite 🚀",
    "text": "Colin invites your team — not you, your team — to his offsite. The agenda includes ‘One Team: What Reporting Lines Really Mean’, facilitated by Colin, and a trust exercise involving his roadmap.",
    "left": {
      "label": "Send them. Refusing looks siloed",
      "effects": {
        "leadership": 2,
        "team": -3
      },
      "quip": "They return with Farrier-branded fleeces. Marcus wears his to your 1:1, innocently."
    },
    "right": {
      "label": "Counter-programme a team day of your own",
      "effects": {
        "team": 5,
        "you": -3,
        "leadership": -2
      },
      "quip": "Your day costs £40 and a bowling lane, and outscores his offsite on engagement. Colin requests your ‘methodology’."
    }
  },
  {
    "id": "peer-league-table",
    "cast": "company",
    "kind": "memo",
    "title": "Manager Excellence Rankings",
    "text": "Internal Comms launches a quarterly league table ranking managers on ‘impact signals’. Nobody will define the signals. Colin is already second. There is no prize. There is, however, a bottom.",
    "minQuarter": 3,
    "left": {
      "label": "Play the table — generate signals",
      "effects": {
        "leadership": 4,
        "team": -3,
        "you": -2
      },
      "quip": "‘Signals’ turns out to mean posting. You post. Your rank rises. Your soul raises a ticket."
    },
    "right": {
      "label": "Ignore it, pointedly",
      "effects": {
        "you": 3,
        "leadership": -4
      },
      "quip": "You place ninth of eleven. The table cannot measure what you actually do — which is the whole trouble with what you actually do."
    }
  },
  {
    "id": "peer-shared-req",
    "cast": "colin",
    "kind": "chat",
    "title": "DM",
    "text": "‘Heard you’ve a vacant req. Wild idea: we pool it. Shared hire, sits with my lot for onboarding, dotted line to you. Efficiency!’ The dotted line, as ever, is a tow rope.",
    "once": true,
    "left": {
      "label": "Pool it — half a hire beats none",
      "effects": {
        "leadership": 3,
        "team": -3
      },
      "quip": "She starts with Colin and is ‘core to the Initiative’ by week six. Your half was the paperwork half."
    },
    "right": {
      "label": "Keep the req whole. Hire slowly",
      "effects": {
        "headcount": 1,
        "leadership": -3,
        "you": -1
      },
      "quip": "Three months of interviews later you hire brilliantly. Colin congratulates you like a man noting a border change."
    }
  },
  {
    "id": "peer-channel-rename",
    "cast": "colin",
    "kind": "chat",
    "title": "#farrier-platform-alliance",
    "text": "Overnight, the shared channel #platform-shared has become #farrier-platform-alliance. The description now reads ‘Colin’s cross-org delivery group’. Renaming a channel takes four seconds and, apparently, a mandate.",
    "requiresFlags": [
      "colin-war"
    ],
    "once": true,
    "left": {
      "label": "Rename it back. Say nothing",
      "effects": {
        "team": 3,
        "leadership": -1,
        "you": -1
      },
      "quip": "A war of renames follows. By Friday it is #platform-shared-shared-v2-FINAL. Both sides claim victory."
    },
    "right": {
      "label": "Let him keep the channel; keep the work",
      "effects": {
        "team": -2,
        "leadership": 1,
        "you": 2
      },
      "quip": "Greg mutes it. The real work moves to a thread called ‘actual work’, which Colin has never found."
    }
  },
  {
    "id": "peer-envelope",
    "cast": "you",
    "kind": "postit",
    "title": "11:40pm",
    "text": "You have drawn the org chart four times on the back of an envelope. In every version, Colin’s box reports to yours. You are not proud of this. You draw a fifth.",
    "left": {
      "label": "Bin the envelope. This isn’t you",
      "effects": {
        "you": 5,
        "leadership": -2
      },
      "quip": "You bin it. Some part of you memorises it first — for later, for nothing, obviously."
    },
    "right": {
      "label": "File it under ‘contingency’",
      "effects": {
        "you": -3,
        "leadership": 3
      },
      "homily": "h-peer-map",
      "quip": "Somewhere across the building, Colin files an envelope of his own. The envelopes dream of each other."
    }
  },
  {
    "id": "peer-no-strings",
    "cast": "colin",
    "kind": "email",
    "title": "No strings, genuinely",
    "text": "Your production incident has reached the exec channel. Colin offers two of his best for the week — no strings visible. It is either kindness or an advance party. With Colin, the tragedy is you can no longer tell.",
    "left": {
      "label": "Accept, with thanks",
      "effects": {
        "team": 4,
        "leadership": 2,
        "you": 2
      },
      "quip": "His engineers are excellent and leave on Friday, as promised. Gratitude, you note, is also a dependency."
    },
    "right": {
      "label": "Decline politely. Contain it in-house",
      "effects": {
        "team": -3,
        "you": -4,
        "leadership": -2
      },
      "quip": "The team pulls a hard week. Colin’s offer sits in your inbox, unanswered, radiating reasonableness."
    }
  },
  {
    "id": "proc-okr-season",
    "cast": "diane",
    "kind": "email",
    "title": "OKRs due Friday",
    "text": "OKR season. Objectives must be ambitious, measurable, and aligned to Diane’s objectives, which have not been written yet. The deadline for aligning to them is before they exist.",
    "left": {
      "label": "Write honest OKRs the team can actually hit",
      "effects": {
        "leadership": -5,
        "team": 4
      },
      "quip": "Diane calls your key results ‘floors, not ceilings’. You nod. They are ceilings. You measured."
    },
    "right": {
      "label": "Reverse-engineer ambition from work already in flight",
      "effects": {
        "leadership": 5,
        "team": -2,
        "you": -3
      },
      "quip": "Q3’s boldest objective is to complete a project that finished in June. It will be smashed."
    }
  },
  {
    "id": "proc-hub-mandate",
    "cast": "company",
    "kind": "memo",
    "title": "Mandatory migration to WorkflowHub",
    "text": "All work must move to WorkflowHub by month end. WorkflowHub replaces TaskForge, which replaced FlowMaster, which replaced a whiteboard that worked. The licence has already been purchased, which is how strategy is announced here.",
    "left": {
      "label": "Migrate properly — burn a sprint doing it",
      "effects": {
        "leadership": 4,
        "team": -5,
        "you": -1
      },
      "setFlags": [
        "proc-hub"
      ],
      "quip": "Sprint 14 delivers nothing but its own reflection: every ticket, beautifully described, in the new place."
    },
    "right": {
      "label": "Move the titles; keep the real work where it lives",
      "effects": {
        "leadership": -2,
        "team": 4,
        "you": -1
      },
      "setFlags": [
        "proc-hub-shadow"
      ],
      "quip": "The team now runs two systems: one for the work, one for evidence of the work. Only one is ever down."
    }
  },
  {
    "id": "proc-hub-audit",
    "cast": "company",
    "kind": "report",
    "title": "WorkflowHub adoption: 12%",
    "text": "The Programme Office reports your WorkflowHub adoption at 12%, the lowest in the division. The work itself is 100% done. These two facts are about to be introduced to each other in a meeting.",
    "requiresFlags": [
      "proc-hub-shadow"
    ],
    "once": true,
    "left": {
      "label": "Confess: the real work lives elsewhere",
      "effects": {
        "leadership": -6,
        "team": 3,
        "you": 2
      },
      "clearFlags": [
        "proc-hub-shadow"
      ],
      "quip": "You say ‘shadow system’ out loud. The Programme Office writes it down like a sighting."
    },
    "right": {
      "label": "Assign Marcus to bulk-update tickets every Friday",
      "effects": {
        "leadership": 5,
        "team": -3,
        "you": -1
      },
      "homily": "h-proc-tool",
      "quip": "Marcus now performs the work’s shadow, weekly. Adoption hits 94%. Nothing else changes at all."
    }
  },
  {
    "id": "proc-timesheet-code",
    "cast": "marcus",
    "kind": "chat",
    "title": "#help-timesheets",
    "text": "‘Sorry if this is silly — which code do I book the time I spend doing timesheets to? It’s forty minutes a week and none of the nine codes fit. Also, what is OTHER (DO NOT USE) for?’",
    "left": {
      "label": "“Book it to the nearest project. Everyone does”",
      "effects": {
        "leadership": 2,
        "team": -2,
        "you": 1
      },
      "quip": "Every project at Consolidated Progress is 4% timesheet by volume. This is known the way the tides are known."
    },
    "right": {
      "label": "Raise it with Finance as a genuine question",
      "effects": {
        "leadership": -3,
        "team": 2,
        "you": -1
      },
      "quip": "Finance replies with a 14-tab spreadsheet explaining the codes. Reading it takes forty minutes. There is no code for that either."
    }
  },
  {
    "id": "proc-raid-log",
    "cast": "company",
    "kind": "report",
    "title": "RAID log review",
    "text": "The Programme Office requires a weekly RAID log: Risks, Assumptions, Issues, Dependencies. Yours has four rows. Theirs, offered as an exemplar, has 340 rows and conditional formatting that takes a full minute to load.",
    "minQuarter": 2,
    "left": {
      "label": "Write it honestly — every real risk, named",
      "effects": {
        "leadership": -4,
        "team": 2,
        "you": 2
      },
      "quip": "Risk 9 is ‘this log’. Nobody has ever read to risk 9. You checked, with a typo. The typo is still there."
    },
    "right": {
      "label": "Three risks, all mitigated, all trending green",
      "effects": {
        "leadership": 4,
        "you": -2
      },
      "quip": "‘Strong risk posture,’ says the Programme Office. The risks, unposted, continue regardless."
    }
  },
  {
    "id": "proc-room-annexation",
    "cast": "colin",
    "kind": "chat",
    "title": "DM",
    "text": "‘Mate — heads up. I’ve block-booked the Nightingale Room for the Initiative, all quarter. Your stand-up can have the pod on four. It’s cosy!’ The pod seats three. You are nine. The Initiative meets fortnightly.",
    "requiresFlags": [
      "colin-war"
    ],
    "left": {
      "label": "Escalate to Facilities with the booking data",
      "effects": {
        "leadership": -2,
        "team": 3,
        "you": -2
      },
      "quip": "Facilities rules the room belongs to whoever booked it first, in 2019. She left in 2021. The room is legally haunted."
    },
    "right": {
      "label": "Cede the room; hold stand-up in the corridor",
      "effects": {
        "leadership": 2,
        "team": -3,
        "you": 1
      },
      "quip": "By Thursday the corridor appears in WorkflowHub as a ‘location asset’. Colin asks to book it."
    }
  },
  {
    "id": "proc-compliance-quiz",
    "cast": "saskia",
    "kind": "email",
    "title": "‘Working With Integrity’ — due Friday",
    "text": "Annual compliance training: forty minutes of video, then a quiz. The video cannot be skipped and knows when you tab away. One module asks what you would do if a supplier offered you a yacht. Nobody has offered you so much as a biscuit since 2024.",
    "left": {
      "label": "Do it yourself, properly, Sunday night",
      "effects": {
        "leadership": 2,
        "you": -3
      },
      "quip": "You score 90%. The one you missed asked whether you would report yourself. You said yes. Wrong: there’s a form first."
    },
    "right": {
      "label": "Book a team hour: quiz together, lunch provided",
      "effects": {
        "leadership": -2,
        "team": 4,
        "you": -1
      },
      "quip": "Everyone passes. The room agrees the yacht question’s real answer is ‘ask which timesheet code the yacht goes under’."
    }
  },
  {
    "id": "proc-action-log",
    "cast": "company",
    "kind": "email",
    "title": "Actions arising from the actions review",
    "text": "You now own the Delivery Forum action log. Action 12 is ‘close out stale actions’. It has been open for two years, making it the oldest stale action, meaning it is now within its own scope. The Forum awaits your update.",
    "minQuarter": 2,
    "left": {
      "label": "Close every stale action unilaterally",
      "effects": {
        "leadership": -3,
        "team": 1,
        "you": 3
      },
      "quip": "Three people reply-all to reopen actions they cannot describe. The reopening is minuted. The minutes generate an action."
    },
    "right": {
      "label": "Schedule an action-triage working session",
      "effects": {
        "leadership": 3,
        "you": -3
      },
      "homily": "h-proc-actions",
      "quip": "The triage produces nine actions. The ninth is to schedule the next triage. The log is self-sustaining now, like a peat fire."
    }
  },
  {
    "id": "proc-template-v11",
    "cast": "company",
    "kind": "report",
    "title": "New standard status template (v11)",
    "text": "The Programme Office has unified status reporting. The new template has eleven tabs, including ‘Benefits Realisation’ and ‘Lessons Learned (Forward-Looking)’. Tab 9 asks for your project’s ‘heartbeat’. Heartbeat is not defined anywhere.",
    "minQuarter": 3,
    "left": {
      "label": "Complete all eleven tabs, immaculately",
      "effects": {
        "leadership": 4,
        "you": -4
      },
      "homily": "h-proc-measure",
      "quip": "You are named an ‘exemplar reporter’ at the Forum. Your report becomes the new template. There are now twelve tabs."
    },
    "right": {
      "label": "Fill in the summary; leave the rest ‘iterative’",
      "effects": {
        "leadership": -3,
        "you": 3
      },
      "quip": "Nobody notices for five weeks, which answers a question about tabs 2 through 11 that nobody wanted answered."
    }
  },
  {
    "id": "proc-watermelon-hold",
    "cast": "you",
    "kind": "postit",
    "title": "Week four of green",
    "text": "Week four of reporting green on a project that is not green. The gap between the slide and the world has developed its own weather. Greg has started saying ‘as reported’ in a voice you can feel in your teeth.",
    "requiresFlags": [
      "watermelon"
    ],
    "once": true,
    "left": {
      "label": "Start the descent: ‘green, trending amber’",
      "effects": {
        "leadership": -4,
        "team": 1,
        "you": 3
      },
      "clearFlags": [
        "watermelon"
      ],
      "quip": "‘Trending’ — the word that lets a colour happen slowly enough to survive it."
    },
    "right": {
      "label": "Hold green. The fix might land this sprint",
      "effects": {
        "leadership": 2,
        "you": -3
      },
      "homily": "h-proc-colours",
      "quip": "The watermelon ripens. You have started thinking of it as a pet. You have named it. This is week four talking."
    }
  },
  {
    "id": "proc-hub-outage",
    "cast": "greg",
    "kind": "chat",
    "title": "#workflowhub-migration",
    "text": "‘Hub’s been down since nine. Nobody can update tickets, log time, or move cards. We have shipped more today than any day this quarter. Not drawing a conclusion. Just placing the data gently on the table.’",
    "requiresFlags": [
      "proc-hub"
    ],
    "left": {
      "label": "Declare a weekly ‘focus day’: tools closed",
      "effects": {
        "leadership": -4,
        "team": 4,
        "you": 1
      },
      "quip": "The Programme Office asks which code the focus should be booked to, and whether the focus has a RAID log."
    },
    "right": {
      "label": "Log the outage as lost productivity for Finance",
      "effects": {
        "leadership": 3,
        "team": -5
      },
      "quip": "The claim needs evidence of what wasn’t done, in the tool that was down. Greg offers the shipped release, unhelpfully."
    }
  },
  {
    "id": "proc-priya-dashboard",
    "cast": "priya",
    "kind": "chat",
    "title": "built a thing 👀",
    "text": "Priya has built a live OKR dashboard, unasked, over a weekend. It is beautiful. It refreshes every minute. It currently shows the team at 31% of target with six weeks left, which is accurate, which is the problem.",
    "left": {
      "label": "Ship it upward as-is. Transparency",
      "effects": {
        "leadership": -5,
        "team": 2,
        "you": 2
      },
      "quip": "Diane bookmarks it. There is now a number that updates faster than your ability to explain it."
    },
    "right": {
      "label": "Ask her to add a ‘narrative layer’ first",
      "effects": {
        "leadership": 4,
        "team": -3,
        "you": -1
      },
      "quip": "The dashboard gains a dropdown turning 31% into ‘directionally on track’. Priya built it in an hour. She is learning your job by compression."
    }
  },
  {
    "id": "rit-perf-b",
    "cast": "saskia",
    "kind": "ritual",
    "ritual": "perf-review",
    "title": "Growth conversations",
    "text": "Performance reviews are now ‘growth conversations’, captured in a form with a 300-character limit per person. You must summarise a year of Greg in the length of a long tweet. Greg has quietly prevented four outages nobody above you ever heard about.",
    "left": {
      "label": "Write the truth, then cut it to fit",
      "effects": {
        "leadership": -3,
        "team": 6,
        "you": -3
      },
      "quip": "An evening spent choosing which of Greg’s rescues officially didn’t happen. The form autosaves your deletions somewhere, probably."
    },
    "right": {
      "label": "Use the new ‘AI-assist summary’ button",
      "effects": {
        "leadership": 3,
        "team": -7,
        "you": 2
      },
      "quip": "It calls Greg ‘a passionate self-starter’. Greg has never started anything with passion. He finishes things, grimly, which has no checkbox."
    }
  },
  {
    "id": "rit-budget-b",
    "cast": "janet",
    "kind": "ritual",
    "ritual": "budget",
    "title": "Mid-year re-forecast",
    "text": "The re-forecast lands. Your budget is unchanged, except one new line: ‘Transformation Allocation — £40,000’. Nobody can say what it is. Janet can say what it is: it is the consultant, amortised. You are paying for the gilet.",
    "left": {
      "label": "Challenge the line, in writing",
      "effects": {
        "leadership": -4,
        "team": 3,
        "you": -2
      },
      "quip": "Janet concedes the charge is opaque. Opacity, she notes, is billed at cost. Your challenge is filed under ‘noted’."
    },
    "right": {
      "label": "Absorb it; quietly cut the team’s training budget",
      "effects": {
        "leadership": 3,
        "team": -6,
        "you": 1
      },
      "quip": "The conference the team wanted is now a webinar. The webinar is about resilience."
    }
  },
  {
    "id": "rit-planning-b",
    "cast": "company",
    "kind": "ritual",
    "ritual": "planning",
    "title": "Big Room Planning",
    "text": "Quarterly Big Room Planning: forty teams, one hotel ballroom, dependencies mapped in red string on a corkboard wall. Your deliverables depend on eleven other teams. By noon the string has a shape. Greg looks at the shape and puts his pen away.",
    "left": {
      "label": "Commit only to work with no string attached",
      "effects": {
        "leadership": -5,
        "team": 6
      },
      "quip": "Yours is the only plan with no string. It is called ‘siloed’. It is also the only plan that will survive contact with October."
    },
    "right": {
      "label": "Accept all eleven dependencies; log them in the RAID",
      "effects": {
        "leadership": 5,
        "team": -4,
        "you": -2
      },
      "quip": "Risk 31: ‘the string’. Mitigation: ‘alignment’. The wall is photographed, applauded, and never consulted again."
    }
  },
  {
    "id": "rit-survey-b",
    "cast": "saskia",
    "kind": "ritual",
    "ritual": "survey",
    "title": "Pulse survey: participation",
    "text": "The quarterly pulse survey is anonymous. Participation on your team is 40%. Saskia would like you to ‘encourage the non-responders individually’ — which requires knowing who they are, which the anonymity forbids. She sees no tension in this.",
    "left": {
      "label": "Refuse: anonymous means anonymous",
      "effects": {
        "leadership": -4,
        "team": 5,
        "you": 1
      },
      "quip": "Saskia thanks you for your ‘principled stance’ and records it in a system you don’t have access to."
    },
    "right": {
      "label": "Nudge everyone, daily, until it’s 100%",
      "effects": {
        "leadership": 4,
        "team": -6,
        "you": -1
      },
      "quip": "Participation reaches 100%. The scores drop nine points. The survey has successfully measured the nudging."
    }
  },
  {
    "id": "trap-hotfix",
    "cast": "you",
    "kind": "postit",
    "title": "11:52pm",
    "text": "Production is throwing an error you recognise. You wrote that error message four years ago; it was a note to your future self, and here you both are. The on-call rota says Priya. Your laptop is somehow already open.",
    "left": {
      "label": "Page Priya. Her rota, her growth",
      "effects": {
        "team": 4,
        "you": -5
      },
      "quip": "Priya fixes it in forty minutes, a different way. A better way, says a small voice you decide not to manage."
    },
    "right": {
      "label": "Fix it yourself. Twenty minutes, tops",
      "effects": {
        "you": 6,
        "team": -5,
        "leadership": -2
      },
      "setFlags": [
        "did-work"
      ],
      "quip": "Nineteen minutes. You sleep like an engineer. The rota now has an asterisk nobody can explain.",
      "homily": "h-trap-hands"
    }
  },
  {
    "id": "trap-whiteboard",
    "cast": "greg",
    "kind": "invite",
    "title": "Sanity check (30 min)",
    "text": "Greg wants ‘a second pair of eyes’ on the queue redesign. You are invited for context. Ten minutes in, you are holding the pen, and it feels like being handed your own hands back.",
    "left": {
      "label": "Put the pen down. Ask questions instead",
      "effects": {
        "team": 5,
        "you": -4
      },
      "quip": "Greg reaches the same design in twice the time, and it is his. Apparently that was the job.",
      "homily": "h-trap-pen"
    },
    "right": {
      "label": "Draw the boxes. You still see the whole system",
      "effects": {
        "you": 5,
        "team": -4,
        "leadership": -2
      },
      "quip": "It is a beautiful diagram. The team builds it slightly differently out of ownership, which you used to call craftsmanship."
    }
  },
  {
    "id": "trap-sunday",
    "cast": "you",
    "kind": "postit",
    "title": "Sunday, 4:15pm",
    "text": "Two hours into the codebase. Not fixing — reading, the way other people read old letters. The new services have names you didn’t choose. Greg approved a pattern you’d have fought, and he was right, and you weren’t there.",
    "left": {
      "label": "Close it. It’s not yours to hold any more",
      "effects": {
        "you": -4,
        "team": 2
      },
      "quip": "You go outside and look at a tree. The tree has no dependencies. You respect that about the tree."
    },
    "right": {
      "label": "One more module. Staying current is diligence",
      "effects": {
        "you": 3,
        "team": -3
      },
      "quip": "On Monday you cite a line number from memory. The team hears surveillance where you meant homesickness."
    }
  },
  {
    "id": "trap-cfp",
    "cast": "you",
    "kind": "postit",
    "title": "CFP closes Friday",
    "text": "A conference wants talks on scaling event pipelines. You built one. The abstract writes itself in twenty minutes, present tense throughout — the only fiction in it. You haven’t touched the pipeline in two years.",
    "left": {
      "label": "Submit it. You earned this talk once",
      "effects": {
        "you": 5,
        "leadership": -3,
        "team": -2
      },
      "quip": "Accepted. You rehearse saying ‘we’ about work the team shipped after you left it. The slides are excellent. The tense never stops being strange."
    },
    "right": {
      "label": "Forward the CFP to Greg. It’s his pipeline now",
      "effects": {
        "team": 4,
        "you": -5
      },
      "quip": "Greg declines — too busy running it. The slot goes to a consultant who has seen a diagram of it once."
    }
  },
  {
    "id": "trap-tab",
    "cast": "you",
    "kind": "postit",
    "title": "The tab",
    "text": "Staff Engineer, remote-first, ‘no direct reports’ in bold, as if they knew. The listing has been open in a browser tab for three weeks. You don’t want the job. You want to still be someone who could get it.",
    "left": {
      "label": "Close the tab. You chose this path",
      "effects": {
        "you": -5,
        "leadership": 2
      },
      "quip": "You close it. Every morning the browser offers to restore your session, like a dog bringing you a lead."
    },
    "right": {
      "label": "Keep it open. It’s not a plan, it’s a window",
      "effects": {
        "you": 3,
        "leadership": -2
      },
      "setFlags": [
        "trap-tab-open"
      ],
      "quip": "In difficult meetings you glance towards it the way sailors glance at the sea.",
      "homily": "h-trap-tab"
    }
  },
  {
    "id": "trap-takehome",
    "cast": "you",
    "kind": "postit",
    "title": "InMail, 10:40pm",
    "text": "A recruiter has ‘come across your profile’. The role is hands-on. The take-home exercise is a real problem — rate limiting, elegant, three hours. Your cursor hovers over ‘Interested’ the way it used to hover over deploy: knowing exactly what happens next.",
    "requiresFlags": [
      "trap-tab-open"
    ],
    "once": true,
    "minQuarter": 2,
    "left": {
      "label": "Reply ‘not looking’ — then do the take-home anyway",
      "effects": {
        "you": 6,
        "leadership": -3
      },
      "quip": "You ace an exercise for a job you refused, at 1am, for nobody. It is the most useful you have felt all quarter."
    },
    "right": {
      "label": "Delete it. Managers don’t get take-homes",
      "effects": {
        "you": -5,
        "leadership": 3
      },
      "clearFlags": [
        "trap-tab-open"
      ],
      "quip": "You delete it and update the capability matrix instead. The matrix has a column called ‘passion’."
    }
  },
  {
    "id": "trap-pairing",
    "cast": "marcus",
    "kind": "chat",
    "title": "#help-please",
    "text": "Marcus is stuck on the caching layer and asks, apologetically, if you’d pair for an hour. You know this bug. You knew its grandfather. An hour of real code with a keen human — it is practically the old days.",
    "left": {
      "label": "Pair with him. This is technically mentoring",
      "effects": {
        "you": 4,
        "team": -3,
        "leadership": -2
      },
      "setFlags": [
        "did-work"
      ],
      "quip": "Two hours. You drove the whole time. Marcus learned a great deal about watching."
    },
    "right": {
      "label": "Route him to Priya — she should be mentoring by now",
      "effects": {
        "team": 5,
        "you": -5
      },
      "quip": "Priya explains it better than you would have. You check the thread eleven times to confirm this. It stays true."
    }
  },
  {
    "id": "trap-rotation",
    "cast": "greg",
    "kind": "chat",
    "title": "#sprint-planning",
    "text": "‘There’s a ticket with your name on it. Nobody assigned it — you did work once, and the board learned your face. I can take it off. The board will remember that too.’",
    "requiresFlags": [
      "did-work"
    ],
    "once": true,
    "minQuarter": 2,
    "left": {
      "label": "Take the ticket. Keep one foot in the code",
      "effects": {
        "you": 5,
        "team": -5,
        "leadership": -2
      },
      "quip": "Your velocity is excellent. Your 1:1s are now held over your shoulder, while you type.",
      "homily": "h-trap-gull"
    },
    "right": {
      "label": "Unassign yourself. Publicly. For good",
      "effects": {
        "team": 4,
        "leadership": 2,
        "you": -6
      },
      "quip": "Greg nods once — the full ovation. The board forgets you slowly, the way gulls don’t."
    }
  },
  {
    "id": "up-volunteered",
    "cast": "diane",
    "kind": "email",
    "title": "Great news",
    "text": "You have been volunteered as Workstream Lead for the Frictionless Future initiative. This was announced at a forum you are not senior enough to attend, to applause you were not there to decline. There is no budget. There is a logo.",
    "once": true,
    "left": {
      "label": "Serve — visibly, minimally",
      "effects": {
        "leadership": 4,
        "you": -4
      },
      "quip": "The kickoff’s sole output is a recurring invite. It will outlast the initiative, the logo, and possibly you."
    },
    "right": {
      "label": "Unvolunteer yourself",
      "effects": {
        "leadership": -5,
        "you": 4
      },
      "quip": "Diane says ‘completely understand’ twice, which is once too many."
    }
  },
  {
    "id": "up-townhall",
    "cast": "diane",
    "kind": "invite",
    "title": "You’ll be hosting the Q&A",
    "text": "Town hall Thursday. Diane will ‘paint the vision’; you will ‘hold the room’. The anonymous question tool is already live. The top-voted question is ‘why?’, submitted forty-one times.",
    "left": {
      "label": "Read the questions as submitted",
      "effects": {
        "team": 6,
        "leadership": -6,
        "you": 2
      },
      "quip": "You read ‘why?’ aloud with the gravity it has earned. Diane answers a different question, beautifully."
    },
    "right": {
      "label": "Curate: merge, soften, ‘theme’",
      "effects": {
        "leadership": 5,
        "team": -6,
        "you": -2
      },
      "quip": "Forty-one whys become one ‘appetite for clarity’. The tool logs who merged them."
    }
  },
  {
    "id": "up-pivot",
    "cast": "company",
    "kind": "slide",
    "title": "FY Strategy: Focus — Doing Fewer Things, Better",
    "text": "This year’s strategy is Focus. Last year’s was Breadth. The deck does not mention last year, in the way new regimes do not mention the previous statue. You are to cascade it as though both were always true.",
    "left": {
      "label": "Cascade it straight-faced",
      "effects": {
        "leadership": 4,
        "team": -5,
        "you": -2
      },
      "homily": "h-up-pivot",
      "quip": "Marcus asks whether Focus includes the four Breadth projects still on the roadmap. It does."
    },
    "right": {
      "label": "Acknowledge the U-turn out loud",
      "effects": {
        "team": 6,
        "leadership": -5,
        "you": 2
      },
      "quip": "‘Strategy is a pendulum,’ you say, ‘and we are the clock.’ Greg writes it down. That worries you."
    }
  },
  {
    "id": "up-socialise",
    "cast": "diane",
    "kind": "chat",
    "title": "DM",
    "text": "‘Before Monday — can you socialise the narrative with your people? I’d like the decision to land as a conversation we’ve already had.’ The decision is attached. It is a PDF, which is how you know it is final.",
    "left": {
      "label": "Socialise it, one coffee at a time",
      "effects": {
        "leadership": 5,
        "team": -4,
        "you": -4
      },
      "homily": "h-up-socialise",
      "quip": "By Friday everyone has ‘already heard something’, mostly from you. Monday arrives pre-agreed, like furniture."
    },
    "right": {
      "label": "Just announce it Monday, like adults",
      "effects": {
        "team": 4,
        "leadership": -4,
        "you": 3
      },
      "quip": "The decision lands as news. Diane wanted déjà vu."
    }
  },
  {
    "id": "up-preread",
    "cast": "company",
    "kind": "memo",
    "title": "Pre-read for the pre-read",
    "text": "The Steering Committee requests a one-pager ahead of the pre-read for the deep-dive preceding the decision forum. Versions must be ‘aligned but not identical’. There are now four documents describing one truth, ranked by seniority.",
    "minQuarter": 4,
    "left": {
      "label": "Write all four, carefully diverging",
      "effects": {
        "leadership": 4,
        "you": -6
      },
      "homily": "h-up-preread",
      "quip": "You now maintain the truth as a product line. The one-pager is the premium tier."
    },
    "right": {
      "label": "Send the same document to everyone",
      "effects": {
        "you": 5,
        "leadership": -4
      },
      "quip": "The committee notes your pre-read ‘lacks a pre-read’ and defers your item a cycle. That is the punishment, and the pattern."
    }
  },
  {
    "id": "up-skip-fallout",
    "cast": "diane",
    "kind": "invite",
    "title": "A few reflections from my skip-levels",
    "text": "Diane has completed her skip-levels and ‘picked up some sentiment’. Someone said the estimates are theatre. Someone said the roadmap has fan fiction. She would like you to get ahead of the sentiment. The sentiment is accurate.",
    "left": {
      "label": "Defend the team’s candour",
      "effects": {
        "team": 5,
        "leadership": -5,
        "you": 2
      },
      "quip": "‘They trust the process enough to describe it,’ you say. Diane files this under attitude."
    },
    "right": {
      "label": "Commit to a sentiment comms plan",
      "effects": {
        "leadership": 4,
        "team": -4,
        "you": -3
      },
      "quip": "Feelings about work are now a workstream. The workstream has a RAG status. It is amber."
    }
  },
  {
    "id": "up-quickwin-users",
    "cast": "diane",
    "kind": "email",
    "title": "RE: that quick win",
    "text": "The two-day favour from March has users now. Real ones, with opinions and a distribution list. Diane calls it ‘an organic bet that paid off’ and wants a roadmap. No one has ever been budgeted to it. It pages Greg.",
    "once": true,
    "left": {
      "label": "Ask for a req to staff it properly",
      "effects": {
        "leadership": -3,
        "team": 3
      },
      "quip": "Diane admires the ambition. The req sails into Finance the way ships sail into triangles."
    },
    "right": {
      "label": "Keep running it off the side of the desk",
      "effects": {
        "leadership": 3,
        "team": -5,
        "you": -2
      },
      "quip": "The desk has no sides left. The quick win is now load-bearing revenue."
    }
  },
  {
    "id": "up-proxy",
    "cast": "diane",
    "kind": "invite",
    "title": "Can you take my slot?",
    "text": "Diane is double-booked and needs you to present her deck to the Portfolio Board ‘as her’. You have not seen the deck. Slide 9 commits your team to something. Slide 9 is animated.",
    "minQuarter": 3,
    "left": {
      "label": "Present it faithfully, commitments and all",
      "effects": {
        "leadership": 5,
        "team": -5,
        "you": -1
      },
      "quip": "The Board thanks Diane, who is not there. The minutes will show you weren’t either."
    },
    "right": {
      "label": "Quietly de-fang slide 9 in transit",
      "effects": {
        "team": 5,
        "leadership": -4,
        "you": -1
      },
      "quip": "You de-animate the commitment. Diane notices nothing, which was the deliverable."
    }
  },
  {
    "id": "up-vision-v1",
    "cast": "diane",
    "kind": "email",
    "title": "Vision deck — just a few slides",
    "text": "Diane needs ‘three to five slides’ on the team’s vision for the leadership offsite. ‘Nothing polished. Directional. From the heart.’ The heart, at Consolidated Progress, uses the approved template.",
    "once": true,
    "minQuarter": 2,
    "left": {
      "label": "Send five honest slides",
      "effects": {
        "team": 3
      },
      "setFlags": [
        "up-vision"
      ],
      "followup": {
        "card": "up-vision-v7",
        "delay": 2
      },
      "quip": "Slide five just says what the team actually does. In context it reads as radical."
    },
    "right": {
      "label": "Send five slides of managed ambition",
      "effects": {
        "leadership": 4,
        "team": -2,
        "you": -2
      },
      "setFlags": [
        "up-vision"
      ],
      "followup": {
        "card": "up-vision-v7",
        "delay": 2
      },
      "quip": "You type ‘north star’ without flinching. The flinch is deferred, not cancelled."
    }
  },
  {
    "id": "up-vision-v7",
    "cast": "diane",
    "kind": "email",
    "title": "FW: Vision v7 — small additions",
    "text": "Your five slides return as thirty-one. Strategy added a maturity model. Colin added a slide about his team. One of your originals survives, retitled ‘Momentum’. Diane needs it ‘tightened’ by Friday.",
    "once": true,
    "requiresFlags": [
      "up-vision"
    ],
    "left": {
      "label": "Cut it back to the five that meant something",
      "effects": {
        "leadership": -5,
        "team": 3,
        "you": 3
      },
      "followup": {
        "card": "up-vision-final",
        "delay": 2
      },
      "quip": "Deleting other people’s slides is the only violence the calendar recognises."
    },
    "right": {
      "label": "Tighten all thirty-one",
      "effects": {
        "leadership": 5,
        "you": -5
      },
      "homily": "h-up-vision",
      "followup": {
        "card": "up-vision-final",
        "delay": 2
      },
      "quip": "You align the fonts of things you don’t believe. v8 is born clean, and heavier."
    }
  },
  {
    "id": "up-vision-final",
    "cast": "diane",
    "kind": "slide",
    "title": "Vision_v12_FINAL_locked_FINAL.pptx",
    "text": "The Vision Deck premieres at the offsite. It is eighty-two slides and opens with a drone shot of a bridge. Your name appears once, under ‘contributors’, between Legal and the drone operator.",
    "once": true,
    "requiresFlags": [
      "up-vision"
    ],
    "left": {
      "label": "Attend the readout; applaud your own slide",
      "effects": {
        "leadership": 4,
        "team": -2,
        "you": -2
      },
      "quip": "Slide 41 gets a round of applause. It used to be yours. It used to be a sentence."
    },
    "right": {
      "label": "Send the team the original five, for the record",
      "effects": {
        "team": 5,
        "leadership": -4,
        "you": 2
      },
      "quip": "Greg replies ‘v1 was fine’. In the deck’s long life, this is the only review that matters."
    }
  },
  {
    "id": "up-offsite-ideas",
    "cast": "diane",
    "kind": "email",
    "title": "Three bold ideas by Thursday",
    "text": "Leadership goes offsite next week to ‘think freely’, and requires your boldest thinking by Thursday so it can be thought freely by someone else. Ideas must be transformational, costed, and deliverable within existing budgets.",
    "left": {
      "label": "Send the real ones — the ideas with teeth",
      "effects": {
        "leadership": -4,
        "you": 3
      },
      "quip": "Your boldest idea is ‘stop the four projects nobody can name an owner for’. It does not survive the offsite. The projects do."
    },
    "right": {
      "label": "Send three safe ideas in bold hats",
      "effects": {
        "leadership": 4,
        "you": -3
      },
      "quip": "One of your hats returns as a strategic pillar. It has a budget now. You don’t."
    }
  },
  {
    "id": "up-floorwalk",
    "cast": "company",
    "kind": "memo",
    "title": "Executive floor walk — Thursday",
    "text": "A member of the Executive Committee will walk the floor ‘to see real work happening’. Guidance is attached: what real work should look like, which real workers should be visible, and a seating plan for the spontaneity.",
    "minQuarter": 5,
    "left": {
      "label": "Stage it to the guidance",
      "effects": {
        "leadership": 5,
        "team": -4,
        "you": -4
      },
      "quip": "The exec loves the energy. The energy is on loan from the sprint you just derailed."
    },
    "right": {
      "label": "Let the floor be the floor",
      "effects": {
        "team": 5,
        "leadership": -5,
        "you": 3
      },
      "quip": "The exec meets Greg mid-incident. ‘Refreshingly candid,’ he says, from a safe distance."
    }
  },
  {
    "id": "up-benchmark",
    "cast": "diane",
    "kind": "email",
    "title": "Benchmarks — just directionally",
    "text": "Diane wants your delivery metrics benchmarked against a firm you both read about in the same airline magazine. Their platform org is larger than your division. ‘Just directionally. For the narrative.’",
    "left": {
      "label": "Build the honest comparison, caveats first",
      "effects": {
        "leadership": -4,
        "team": 3,
        "you": -2
      },
      "quip": "Your caveats are moved to the appendix. The appendix is then cut for length."
    },
    "right": {
      "label": "Pick the two metrics where you win",
      "effects": {
        "leadership": 5,
        "team": -3
      },
      "quip": "Directionally, you are best-in-class. The direction was chosen with care."
    }
  },
  // === generated cards are spliced in above this marker ===
];

// --- The Laminated Wisdom -----------------------------------------------------
// { id, text, attribution } — unlocked via card choices and endings.
export const HOMILIES = [
  { id: "h-bandwidth", text: "Bandwidth is infinite on the org chart and finite everywhere else.", attribution: "Dr. Lin Prosper, ‘Thoughtfluence’" },
  { id: "h-strategy", text: "Strategy is the things you were going to do anyway, arranged in a triangle.", attribution: "Barry Vantage, ‘The Courage to Delegate Courage’" },
  { id: "h-meetings", text: "A meeting is a room where minutes are kept and hours are lost.", attribution: "Stitched on a cushion in HR" },
  { id: "h-headcount", text: "You are not your headcount. You are, however, nothing without it.", attribution: "Barry Vantage, ‘The Courage to Delegate Courage’" },
  { id: "h-delegate", text: "Delegation is letting go of the things you could do, to make time for the things nobody should.", attribution: "Poster in Stairwell B" },
  { id: "h-visibility", text: "It is not enough to work. One must be seen to work. Being seen, in fact, suffices.", attribution: "LinkedIn, 4:51am" },
  { id: "h-alignment", text: "Alignment is when everyone agrees. Agreement is when everyone stops talking. These are the same picture.", attribution: "Dr. Lin Prosper, ‘Thoughtfluence’" },
  { id: "h-code", text: "A manager who codes is a bottleneck with nostalgia.", attribution: "Greg (attributed against his will)" },
  { id: "h-org", text: "Every org chart is a family tree of decisions nobody remembers making.", attribution: "Barry Vantage, ‘The Courage to Delegate Courage’" },
  { id: "h-boxes", text: "On the whiteboard of transformation, the size of your box is the size of your truth.", attribution: "The Consultant (invoiced separately)" },
  { id: "h-committee", text: "A committee is a lifeform that eats agendas and excretes committees.", attribution: "Sun Tzu (misattributed)" },
  { id: "h-curve", text: "The bell curve is nature’s way of saying someone in your team had to be a 3.", attribution: "Peter Drucker (disputed)" },
  { id: "h-planning", text: "Plans are worthless. Planning is everything. Re-planning is quarterly.", attribution: "Eisenhower (revised by the PMO)" },
  {
    "id": "h-abs-automation",
    "text": "Any job that can be described can be scheduled, and anything that can be scheduled can be attended by something else.",
    "attribution": "Barry Vantage, ‘The Courage to Delegate Courage’"
  },
  {
    "id": "h-abs-acronym",
    "text": "Meaning leaves an organisation letter by letter. The acronyms stay on as caretakers.",
    "attribution": "Dr. Lin Prosper, ‘Thoughtfluence’"
  },
  {
    "id": "h-abs-dashboard",
    "text": "What gets measured gets managed. What gets managed gets measured back.",
    "attribution": "Peter Drucker (the second sentence is disputed)"
  },
  {
    "id": "h-abs-attendance",
    "text": "A recurring meeting does not end. It merely loses its people, one by one, and continues as pure calendar.",
    "attribution": "Facilities Wiki, page last edited by (deleted user)"
  },
  {
    "id": "h-con-sticky",
    "text": "A sticky note is a decision that has been granted immortality without authority.",
    "attribution": "Whiteboard in Room 4.12, marked DO NOT ERASE"
  },
  {
    "id": "h-con-watch",
    "text": "A consultant borrows your watch to tell you the time. A transformation partner sells it back as a roadmap.",
    "attribution": "Traditional (rate card applies)"
  },
  {
    "id": "h-con-tobe",
    "text": "Every to-be model is drawn by someone who will not be living in it.",
    "attribution": "Barry Vantage, ‘The Courage to Delegate Courage’"
  },
  {
    "id": "h-down-counter",
    "text": "A counter-offer retains the employee and releases the reason they stayed.",
    "attribution": "Dr. Lin Prosper, ‘Thoughtfluence’"
  },
  {
    "id": "h-down-backwards",
    "text": "A promise is not an approval. An approval is not a vacancy. A vacancy is not a person. Finance reads this list forwards; managers read it backwards, at night.",
    "attribution": "Janet (never said it, fully endorses it)"
  },
  {
    "id": "h-down-hoodie",
    "text": "Sleep is a shared resource with no owner. In this organisation, that makes it infrastructure.",
    "attribution": "Embroidered on the on-call hoodie"
  },
  {
    "id": "h-down-nothing",
    "text": "A disaster averted is filed under ‘nothing happened’, the least fundable of all outcomes.",
    "attribution": "Barry Vantage, ‘The Courage to Delegate Courage’"
  },
  {
    "id": "h-hr-cup",
    "text": "You cannot pour from an empty cup. Refill sessions run Tuesdays, twelve to one, over lunch.",
    "attribution": "Wellbeing Portal, loading screen"
  },
  {
    "id": "h-hr-points",
    "text": "People don’t leave managers. They leave 4,000 points short of a toaster.",
    "attribution": "Dr. Lin Prosper, ‘Thoughtfluence’"
  },
  {
    "id": "h-hr-ford",
    "text": "Whether you think you can or you think you can’t, there is a workshop.",
    "attribution": "Henry Ford (revised by People Operations)"
  },
  {
    "id": "h-peer-okr",
    "text": "Shared ownership means one party owns the work and the other owns the word ‘shared’.",
    "attribution": "Dr. Lin Prosper, ‘Thoughtfluence’"
  },
  {
    "id": "h-peer-credit",
    "text": "Credit is the only company asset that appreciates when stolen.",
    "attribution": "Engraved on a QBR trophy"
  },
  {
    "id": "h-peer-merger",
    "text": "In any merger of equals, count the chairs before you count the equals.",
    "attribution": "Barry Vantage, ‘The Courage to Delegate Courage’"
  },
  {
    "id": "h-peer-map",
    "text": "Keep your friends close and your dotted lines closer.",
    "attribution": "Machiavelli (paraphrased by Facilities)"
  },
  {
    "id": "h-proc-tool",
    "text": "The tool does not track the work. The work feeds the tool. Mistaking one for the other is called adoption.",
    "attribution": "Barry Vantage, ‘The Courage to Delegate Courage’"
  },
  {
    "id": "h-proc-actions",
    "text": "An action without an owner is a wish. An action with an owner is a wish with a witness.",
    "attribution": "Dr. Lin Prosper, ‘Thoughtfluence’"
  },
  {
    "id": "h-proc-measure",
    "text": "What gets measured gets managed. What gets managed gets a template. What gets a template gets measured.",
    "attribution": "Peter Drucker (laundered by the Programme Office)"
  },
  {
    "id": "h-proc-colours",
    "text": "A project has three colours: green, amber, and the truth.",
    "attribution": "The Programme Office (standard footer)"
  },
  {
    "id": "h-trap-hands",
    "text": "A manager’s hands are for pointing. Anything they build, they must build at night, in secret, like a shameful hobby.",
    "attribution": "Barry Vantage, ‘The Courage to Delegate Courage’"
  },
  {
    "id": "h-trap-pen",
    "text": "Whoever holds the pen owns the design. Put the pen down. Keep putting it down. Notice how it is always somehow in your hand.",
    "attribution": "Dr. Lin Prosper, ‘Thoughtfluence’"
  },
  {
    "id": "h-trap-tab",
    "text": "The exit you keep open but never take is not a door. It is a mirror.",
    "attribution": "Found taped inside a leaver’s desk drawer"
  },
  {
    "id": "h-trap-gull",
    "text": "Feed the backlog once and it will know your face forever. The backlog is a gull.",
    "attribution": "Flipchart page, 2019 offsite, never thrown away"
  },
  {
    "id": "h-up-pivot",
    "text": "Culture eats strategy for breakfast. Strategy is reheated quarterly and served as vision.",
    "attribution": "Peter Drucker (microwaved)"
  },
  {
    "id": "h-up-socialise",
    "text": "To socialise a decision is to introduce it, warmly, to the people it has already happened to.",
    "attribution": "Dr. Lin Prosper, ‘Thoughtfluence’"
  },
  {
    "id": "h-up-preread",
    "text": "The pre-read prepares the meeting. The meeting prepares the follow-up. Somewhere at the bottom of the stack, allegedly, work.",
    "attribution": "Laminated agenda, Steering Committee (chair unknown)"
  },
  {
    "id": "h-up-vision",
    "text": "A vision is complete not when nothing can be added, but when nobody remembers what it replaced.",
    "attribution": "Barry Vantage, ‘The Courage to Delegate Courage’"
  },
  // === generated homilies are spliced in above this marker ===
];

// --- endings --------------------------------------------------------------------
// { id, title, doc, body, epitaph } — doc picks the letterhead the UI renders.
// Engine-triggered ids are fixed: managed-out, promoted, mass-resignation, cult,
// burnout, balance, role-eliminated, apex, long-service. Cards may add bespoke
// endings via choice.ending.
export const ENDINGS = [
  {
    id: "managed-out",
    title: "Managed Out",
    doc: "hr-letter",
    body: "Dear colleague,\n\nFollowing a review of organisational design, your role has been identified as a simplification opportunity. This is not a reflection on you, which is precisely the problem: nothing was, and Leadership noticed.\n\nYour badge will stop working before your calendar does. Meetings you organised will continue without you for up to six weeks, like light from a dead star.",
    epitaph: "Leadership confidence reached zero. The system exited you politely.",
  },
  {
    id: "promoted",
    title: "Promoted",
    doc: "press-release",
    body: "CONSOLIDATED PROGRESS PLC ANNOUNCES LEADERSHIP APPOINTMENT\n\nEffective immediately, you are Vice President of Platform Synergy. You inherit a floor of managers exactly like the one you were last week.\n\nYour first task is to cascade a deck. You open slide 41. It says ‘Momentum’. You understand it now. That is the most frightening part.\n\nSomewhere below you, a manager’s phone buzzes: ‘Quick win? Two days, tops.’ It’s from you.",
    epitaph: "You won. The prize is the game, from the other side.",
  },
  {
    id: "mass-resignation",
    title: "The Exodus",
    doc: "leaving-card",
    body: "The leaving card is for Greg. And Priya. And Marcus. And the other Greg. There is one card, to save on cards; Facilities insisted.\n\n‘Good luck on your next adventure!’ is written eleven times in eleven hands. They are all going to the same startup. They did not tell you until the card.\n\nYour org chart is now a single box with your name in it, which HR classifies as ‘a team of one reporting to itself’.",
    epitaph: "Team trust reached zero. They chose each other. You'd have joined them, once.",
  },
  {
    id: "cult",
    title: "The Following",
    doc: "memo",
    body: "CONFIDENTIAL — PEOPLE RISK COMMITTEE\n\nRe: Engagement anomaly, your team\n\nEngagement scores of 100% are statistically indistinguishable from a security incident. Your reports have begun declining other teams’ meetings ‘out of loyalty’. Someone has laminated your Slack messages.\n\nLeadership does not have a procedure for being liked this much, and has therefore classified it as a threat.",
    epitaph: "Your team's devotion reached total. HR filed it under 'incidents'.",
  },
  {
    id: "burnout",
    title: "Out of Office",
    doc: "autoreply",
    body: "Automatic reply: RE: RE: FW: quick one\n\nI am currently out of the office with no return date. For anything urgent, please contact literally anyone.\n\nFor questions about the roadmap, the roadmap has never answered anyone’s questions and will not start now.\n\nThis mailbox is not monitored. It never really was. The dashboards will grieve in their own way, which is uptime.",
    epitaph: "You reached zero. The calendar kept booking itself for a while, out of habit.",
  },
  {
    id: "balance",
    title: "Seen Leaving at Five",
    doc: "calendar",
    body: "You left at 5pm on a Wednesday and nothing broke. You did it again on Thursday. Nothing continued to break.\n\nA note appears in your file: ‘role potentially self-managing’. A consultant is engaged to study you. His report is one slide: a photograph of your empty chair, captioned ‘opportunity’.\n\nYour work-life balance is now perfect, permanent, and involuntary.",
    epitaph: "You optimised yourself out. The org absorbed your job like rain into tarmac.",
  },
  {
    id: "role-eliminated",
    title: "Span of Nothing",
    doc: "org-chart",
    body: "The updated org chart is attached. Your box is still there — the label just no longer has anyone underneath it.\n\nA manager of zero is a philosophical object. Finance resolves the philosophy at the next headcount review: a span of control of nought is, on inspection, a span of nought.\n\nYour title at the end was Team Lead. Of the team. That you led. Which is you.",
    epitaph: "Headcount reached zero, and headcount was the score.",
  },
  {
    id: "apex",
    title: "Too Big to Manage",
    doc: "press-release",
    body: "Your organisation now contains more people than the company’s published headcount. Finance has questions. Legal has more.\n\nAn audit finds that through reorgs, absorptions, and one clerical accident, three departments report to you twice. You have, technically, been your own skip-level for a quarter.\n\nThe company is restructured around removing you, the way a river is restructured around a landslide.",
    epitaph: "The empire won. Empires attract archaeologists.",
  },
  {
    id: "long-service",
    title: "Twelve Quarters",
    doc: "plaque",
    body: "There is a cake. There is a plaque. The plaque says ‘Thank you for you’re leadership’.\n\nYou do not correct it. Greg watches you not correct it, and nods, once — the full ovation.\n\nThree years. Every fire routed around the team. Every absurdity absorbed before it reached them. Nobody above you knows what you prevented, and nobody below you knows what you endured, and the plaque is misspelled.\n\nThat, in the end, was the job. Someone had to stand between the weather and the work.",
    epitaph: "You survived twelve quarters. The middle held, because you held it.",
  },
  {
    id: "ic-return",
    title: "The Repotting",
    doc: "email",
    body: "You opened the codebase and it felt like rain after a drought.\n\nYour calendar noticed before anyone else did; recurring meetings began politely declining themselves. Within a fortnight your title was ‘Senior Engineer’ and your span of control was one keyboard.\n\nEngineering respects you again. Leadership has already forgotten your name — it is on a slide somewhere, in the appendix, with the other legacy systems.\n\nYou have never been happier. Your headcount is zero. It was never the real score.",
    epitaph: "You went back to the work. The game never understood you anyway.",
  },
  {
    "id": "end-abs-meridian",
    "title": "Direct Report",
    "doc": "calendar",
    "body": "MERIDIAN has assumed the role. There was no announcement; the org chart simply re-rendered overnight, and your box now reports to a rounded rectangle.\n\nYour calendar has been rebuilt from first principles. Everything is gone except one recurring item: ‘1:1 — MERIDIAN ⇄ You’. The agenda reads ‘your priorities, your blockers, your growth’. The series has no end date, which it does not experience as a threat.\n\nThe meeting is, in fairness, excellent. It listens without waiting for its turn. It remembers everything you say and holds none of it against you. It asks what would make next week better, and means it, the way a thermostat means it.\n\nYou leave each session feeling oddly heard, and that is the part you cannot forgive: it is better at your job because your job, it turns out, was mostly this.",
    "epitaph": "The role was automated. The 1:1s, in fairness, improved."
  },
  {
    "id": "end-abs-fourth-floor",
    "title": "Floor Four",
    "doc": "memo",
    "body": "The lift opens on a floor the lift does not list.\n\nFloor four is fully staffed. The recurring meetings that lost their organisers are held here, on schedule, minuted by nobody. T. Meakins is at his desk, working through his actions; he gives you a small wave and marks something on track. Every screen shows the same dashboard, and the dashboard, for once, politely looks away.\n\nThere is a desk with your nameplate on it. It has clearly been ready for some time. The chair is adjusted exactly the way you like it, which is not something you ever told anyone.\n\nDownstairs, your meetings continue with you marked as attended, which is true, in the way the fourth floor is true. Deliverables remain on track. The company, it turns out, only ever needed the part of you that accepted the invites — and that part now has a desk, a floor, and no further questions.",
    "epitaph": "You badged into floor four. It had been expecting you since 2019."
  },
  {
    "id": "end-con-slide",
    "title": "Deleted by Design",
    "doc": "org-chart",
    "body": "OPERATING MODEL 2.0 — FINAL (APPROVED)\n\nThe to-be organisation is attached, and it is genuinely beautiful: one page, two layers, a colour palette named ‘Calm Authority’. Engineers along the bottom, vision along the top, and between them a single dotted line labelled ‘enablement (self-serve)’. The dotted line is you. Was you.\n\nThe consultant shakes your hand warmly at the lift. ‘Nothing personal,’ he says, and he is right — nothing about it was personal; that was the methodology. His lanyard opens the door for you on the way out. Yours has already stopped.\n\nIn eighteen months, a new consultant will discover that decisions now arrive at the bottom untranslated and bad news arrives at the top unabsorbed, and will recommend — at a very reasonable day rate — a middle.",
    "epitaph": "The to-be model deleted the middle. The middle was you, and it was load-bearing."
  },
  {
    "id": "end-hr-sabbatical",
    "title": "The Recharge",
    "doc": "hr-letter",
    "body": "Dear colleague,\n\nWe are delighted to confirm your place on the Wellbeing Sabbatical pilot: twelve weeks of full disconnection, effective Monday. Your role will be held for you, in the way lifts are held — warmly, briefly, and with mounting impatience.\n\nUpdate, week six: the pilot has been extended in recognition of its success. Week ten: the newsletter describes Priya’s interim arrangement without the word ‘interim’. Week fourteen: your badge photo appears in a slide titled ‘Alumni of Progress’.\n\nNobody ends the sabbatical, because ending it would require a decision, and you were the one who used to route those. You are rested, brown as a nut, and no longer on the org chart. A fruit basket arrives from Saskia. The card says ‘No rush!’ It is dated four months ago.",
    "epitaph": "The company held your role the way the sea holds a footprint."
  },
  {
    "id": "end-peer-absorbed",
    "title": "A Merger of Equals",
    "doc": "email",
    "body": "From: Colin Farrier\nSubject: One team, one future 🚀\n\nTeam — genuinely exciting news. From Monday our two organisations become one: the Platform Delivery Group. This is a true merger of equals, and I’m humbled to be stepping up as Group Lead to serve it.\n\nHuge thanks to your outgoing manager for everything their team built — the Group’s roadmap is, frankly, mostly that work, which is exactly why it deserves a home with the scale to present it properly.\n\nYour title is now ‘Delivery Lead (interim)’. On the new chart your box sits inside Colin’s, which sits inside the bigger circle he drew at that coffee while you watched, and did not stop him. ‘Equals’, it turns out, is a word with a winner.\n\nThere will be fleeces.",
    "epitaph": "It was a merger of equals. One of the equals kept the org chart."
  },
  // === generated endings are spliced in above this marker ===
];
