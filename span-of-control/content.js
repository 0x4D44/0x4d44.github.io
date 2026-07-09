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
  // === generated endings are spliced in above this marker ===
];
