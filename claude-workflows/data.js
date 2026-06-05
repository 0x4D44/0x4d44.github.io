// ============================================================
// claude-workflows — content model
// Dynamic Workflows in Claude Code (research preview, May 2026).
// Plain window globals (no Babel needed), consumed by the .jsx files.
// Facts sourced from Anthropic's announcement + Claude Code docs.
// Jokes sourced from a 1970s sketch troupe and a Torquay hotel.
// ============================================================

// ---- The lifecycle a workflow runs through ----------------------------
window.LIFECYCLE = [
  {
    key: "plan",
    label: "Plan",
    verb: "Claude writes the script",
    blurb:
      "From your one prompt, Claude drafts an orchestration script in JavaScript — the loops, branches and budgets that decide who does what. The first time, it shows you the plan and waits for a nod.",
    gag: "It does not, at this stage, build a giant wooden rabbit. Usually.",
    color: "var(--cw-blue)",
  },
  {
    key: "fanout",
    label: "Fan out",
    verb: "Tens to hundreds of subagents",
    blurb:
      "The script splits the job into subtasks and fires them out across many subagents running in parallel — each in its own context window, each chewing a different slice of the problem.",
    gag: "And now for something completely parallel.",
    color: "var(--cw-red)",
  },
  {
    key: "check",
    label: "Check",
    verb: "Verify before folding in",
    blurb:
      "Nothing is trusted on sight. Each result is checked before it's folded back into the run, so a confident-but-wrong answer doesn't get to poison everything downstream.",
    gag: "“Are you SURE this isn't just a flesh wound?” — yes, the reviewer agent.",
    color: "var(--cw-green)",
  },
  {
    key: "refute",
    label: "Refute",
    verb: "Adversaries attack the findings",
    blurb:
      "Other agents actively try to refute what was found — independent angles, adversarial pokes, deliberate attempts to break the result. Survivors are stronger for it.",
    gag: "NOBODY expects the adversarial subagent. Its chief weapon is surprise.",
    color: "var(--cw-purple)",
  },
  {
    key: "converge",
    label: "Converge",
    verb: "Iterate until answers agree",
    blurb:
      "The run keeps looping — attempt, refute, fix — until the answers converge. That's how a workflow reaches results a single pass simply can't, and progress is saved as it goes.",
    gag: "If interrupted, it picks up where it left off. It is not dead. It is merely resting.",
    color: "var(--cw-magenta)",
  },
  {
    key: "deliver",
    label: "Deliver",
    verb: "One coordinated answer",
    blurb:
      "Because all that coordination happened OUTSIDE your conversation, your main session stayed responsive — and you come back to a single, tidy, already-checked answer.",
    gag: "The bill, however, may consume meaningfully more usage than a typical session.",
    color: "var(--cw-orange)",
  },
];

// ---- Builder palette: step types you can drag into a workflow ----------
// `kind` drives the run-simulation behaviour in builder.jsx.
window.BUILDER_BLOCKS = [
  { id: "plan",     label: "Plan",        kind: "single",  glyph: "▤", color: "var(--cw-blue)",    note: "Draft the orchestration script from the prompt." },
  { id: "fanout",   label: "Fan out",     kind: "fan",     glyph: "⋔", color: "var(--cw-red)",     note: "Split into subtasks across parallel subagents." },
  { id: "map",      label: "Map / port",  kind: "fan",     glyph: "⇶", color: "var(--cw-teal)",    note: "Run the same transform over many files at once." },
  { id: "verify",   label: "Verify",      kind: "single",  glyph: "✓", color: "var(--cw-green)",   note: "Check each result before folding it in." },
  { id: "refute",   label: "Refute",      kind: "single",  glyph: "⚔", color: "var(--cw-purple)",  note: "Adversarial agents try to break the findings." },
  { id: "fixloop",  label: "Fix loop",    kind: "loop",    glyph: "↻", color: "var(--cw-orange)",  note: "Drive build + tests until they run clean." },
  { id: "converge", label: "Converge",    kind: "single",  glyph: "◎", color: "var(--cw-magenta)", note: "Iterate until the answers agree." },
  { id: "deliver",  label: "Deliver",     kind: "single",  glyph: "★", color: "var(--cw-ink)",     note: "Return one coordinated, checked answer." },
  // the silly one
  { id: "silly",    label: "Silly walk",  kind: "silly",   glyph: "🦵", color: "var(--cw-pink)",    note: "Ministry-approved. Adds gait, removes productivity." },
];

// ---- The patterns (recipes) -------------------------------------------
window.PATTERNS = [
  {
    id: "fanout-merge",
    name: "Fan-out / merge",
    color: "var(--cw-red)",
    tagline: "Split a big job into many, do them at once, stitch the results back together.",
    when: "You have hundreds of independent units — files, findings, documents — and they don't depend on each other.",
    how: "The script splits the task, spins up parallel subagents (10s–100s), and a final step merges their outputs into one answer.",
    example: "“Find every place we still call the deprecated billing API across the monorepo.”",
    gag: "Like the Gumbys, but they actually accomplish things and don't bang their heads.",
  },
  {
    id: "fanout-verify",
    name: "Fan-out + verification",
    color: "var(--cw-green)",
    tagline: "Search wide, then independently verify every single finding before you trust it.",
    when: "Bug hunts, security audits, profiler-guided optimisation — anywhere a false positive wastes a human's afternoon.",
    how: "One wave searches in parallel; a second, independent wave re-checks each candidate. Only survivors reach the report.",
    example: "“Audit the service for auth gaps and unsafe input handling, and prove each one is real.”",
    gag: "Every finding must answer three questions before crossing the Bridge of Death.",
  },
  {
    id: "adversarial",
    name: "Adversarial review",
    color: "var(--cw-purple)",
    tagline: "Give Claude independent attempts, then set agents to break the result on purpose.",
    when: "Critical work where the cost of a wrong answer is high and you want it checked twice — or twelve times.",
    how: "Several agents solve from independent angles; adversaries try to refute them; the run iterates until they converge.",
    example: "“Stress-test this migration plan from every angle before I commit to it.”",
    gag: "An argument is a connected series of statements. No it isn't. Yes it is. (This is the good kind.)",
  },
  {
    id: "pipeline",
    name: "Sequential pipeline",
    color: "var(--cw-blue)",
    tagline: "An assembly line: each stage's output is the next stage's input.",
    when: "The work has a natural order and later steps genuinely need earlier results.",
    how: "Stages run in a fixed sequence — read → transform → validate → write — coordinated by the script, not your chat.",
    example: "“Read each PR, analyse it, draft review comments, post them.”",
    gag: "Like a parrot on an assembly line. Each station does one job. Beautiful plumage.",
  },
  {
    id: "migration",
    name: "Map-and-port",
    color: "var(--cw-teal)",
    tagline: "Apply one transformation across thousands of files, with reviewers on each.",
    when: "Framework swaps, API deprecations, language ports — large, repetitive, mechanical-but-careful changes.",
    how: "A mapping pass builds the plan; a porting pass rewrites each file in parallel with reviewers; a fix loop drives tests green.",
    example: "The real Bun rewrite: Zig → Rust, ~750k lines, 99.8% of tests passing, 11 days.",
    gag: "It did not require a shrubbery. Only one. A nice one. Not too expensive.",
  },
  {
    id: "headless",
    name: "Headless / scheduled",
    color: "var(--cw-orange)",
    tagline: "No human in the loop — it runs on a schedule or a trigger and reports back.",
    when: "Overnight cleanups, recurring audits, CI gates — long-running jobs that should survive you closing the laptop.",
    how: "The workflow runs unattended, saves progress as it goes, and resumes after interruptions instead of starting over.",
    example: "“Every night, find unnecessary data copies and open a PR for each one to review in the morning.”",
    gag: "It runs all night. It does not require you to mention the war.",
  },
];

// ---- What they're for: headline use cases -----------------------------
window.USE_CASES = [
  { title: "Codebase-wide bug hunts", body: "Search a whole service in parallel, then independently verify every finding so the report is real issues, not noise.", color: "var(--cw-red)" },
  { title: "Security & hardening passes", body: "Auth checks, input validation and unsafe-pattern sweeps across an entire codebase — found, then proven.", color: "var(--cw-green)" },
  { title: "Large migrations & ports", body: "Framework swaps, API deprecations and language ports that span thousands of files, handled end-to-end.", color: "var(--cw-teal)" },
  { title: "Optimisation audits", body: "Profiler-guided sweeps that surface dead code and cleanup opportunities traditional static analysis missed.", color: "var(--cw-blue)" },
  { title: "Plans, stress-tested", body: "Hand it a plan and let independent and adversarial agents attack it from every angle before you commit.", color: "var(--cw-purple)" },
  { title: "Work you need checked twice", body: "High-stakes changes get independent attempts plus adversaries trying to break the result before you see it.", color: "var(--cw-orange)" },
];

// ---- Good practice (do) and anti-patterns (don't) ---------------------
window.DOS = [
  { t: "Start scoped", d: "Run a bounded task first to feel out the usage before you point it at the whole monorepo." },
  { t: "Turn on auto mode", d: "It's the recommended way to run workflows — let Claude decide when one is warranted." },
  { t: "Define ‘done’", d: "Say exactly what success looks like. An orchestrator with no termination condition can loop forever." },
  { t: "Read the plan", d: "The first trigger shows you what's about to run. Actually read it before you confirm." },
  { t: "Save the good runs", d: "A successful workflow can be saved and reused as a command. Don't reinvent it next week." },
  { t: "Watch /usage", d: "Workflows spend meaningfully more than a normal session. Check the meter; nobody expects the token bill." },
];
window.DONTS = [
  { t: "Don't use it for trivia", d: "Renaming one variable does not need 200 agents and an overnight run. That's just showing off." },
  { t: "Don't leave ultracode on", d: "Great for a session of big, risky tasks. Daft for routine edits — turn it back to high." },
  { t: "Don't skip the budget", d: "No token budget is how a scoped task becomes a small national debt while you sleep." },
  { t: "Don't go headless untested", d: "Autonomous operation means autonomous mistakes. Validate before you remove the human." },
  { t: "Don't ignore convergence", d: "If agents never agree, more agents won't help. Tighten the prompt, not the parallelism." },
  { t: "Don't panic about a stuck run", d: "It isn't dead, it's resting — but you can still stop it from /workflows if it's pining." },
];

// ---- Glossary ----------------------------------------------------------
window.GLOSSARY = [
  { term: "Dynamic workflow", def: "An orchestration script Claude writes for your task; a separate runtime executes it in the background while your chat stays free." },
  { term: "Orchestration script", def: "The JavaScript that holds the plan — loops, branches, budgets, retries. The coordination lives here, not in your conversation." },
  { term: "Subagent", def: "A worker with its own context window that does the actual reading, writing, shell work and review. Workflows spawn many; use one or two on their own for an isolated investigation." },
  { term: "Fan-out", def: "Splitting one task across many parallel subagents at once instead of plodding through them one at a time." },
  { term: "Convergence", def: "The point where independent attempts and their adversaries finally agree, and the loop can stop." },
  { term: "ultracode", def: "A Claude Code session setting in the effort menu: sets reasoning effort to xhigh and lets Claude auto-orchestrate workflows for substantive tasks." },
  { term: "auto mode", def: "Recommended companion to workflows; lets Claude act and decide across steps without stopping to ask at every turn." },
  { term: "Budget", def: "A token ceiling you set so a run can't quietly spend the GDP of a small principality." },
  { term: "Research preview", def: "‘It works, it's real, and it may change.’ Available on Max, Team, Enterprise (if enabled) and the API / Bedrock / Vertex / Foundry." },
  { term: "/deep-research", def: "A bundled workflow: fans searches across angles, fetches sources, cross-checks claims and returns one cited report. A safe first taste." },
];

// ---- Quiz: which pattern fits? ----------------------------------------
window.QUIZ = [
  {
    scenario: "“Hunt for every security hole in our 400-file payments service — and don't waste my time with false alarms.”",
    options: ["Sequential pipeline", "Fan-out + verification", "Headless / scheduled"],
    answer: 1,
    why: "Search wide in parallel, then independently verify each finding. Only proven issues reach the report.",
  },
  {
    scenario: "“Port this 6,000-file service from one framework to another, behaviour-identical, tests still green.”",
    options: ["Map-and-port", "Adversarial review", "Sequential pipeline"],
    answer: 0,
    why: "Map the plan, port each file in parallel with reviewers, then a fix loop drives the tests green. The Bun shape.",
  },
  {
    scenario: "“Before I bet the quarter on this migration plan, tear it apart and find what I missed.”",
    options: ["Fan-out / merge", "Adversarial review", "Headless / scheduled"],
    answer: 1,
    why: "Independent attempts plus adversaries attacking from every angle is exactly the ‘checked twice’ pattern.",
  },
  {
    scenario: "“Every night, sweep the repo for unnecessary copies and open a PR for each so I review them with coffee.”",
    options: ["Headless / scheduled", "Sequential pipeline", "Fan-out + verification"],
    answer: 0,
    why: "Unattended, recurring, survives interruptions and reports back in the morning. Headless to the core.",
  },
  {
    scenario: "“Read each open PR, analyse the diff, draft comments, then post them — in that order.”",
    options: ["Map-and-port", "Sequential pipeline", "Adversarial review"],
    answer: 1,
    why: "A natural fixed order where each stage needs the previous one's output. An honest assembly line.",
  },
  {
    scenario: "“Rename this one local variable in this one file.”",
    options: ["Fan-out / merge", "Adversarial review", "Honestly? Just ask Claude normally."],
    answer: 2,
    why: "Not every job needs the cavalry. A workflow here is a silly walk to the corner shop. Use plain Claude Code.",
  },
];

// ---- One-liners for the random-gag generator --------------------------
window.GAGS = [
  "This workflow is not idle — it's pining for the fjords.",
  "And now for something completely parallel.",
  "Nobody expects the adversarial subagent.",
  "’Tis but a flaky test! I've had worse.",
  "We are the subagents who say ‘Ni!’ — and also ‘merge conflict’.",
  "Right. No one is to spawn agents until I blow this whistle. Even — and I want to make this absolutely clear — even if they say ‘Ni’.",
  "I'm not dead yet! The run resumes where it left off.",
  "She turned me into a newt. …I got better. (The fix loop ran.)",
  "Listen — strange runtimes distributing scripts is no basis for a system of orchestration.",
  "Don't mention the migration. I mentioned it once, but I think I got away with it.",
];

// quick stats banner
window.CW_FACTS = {
  released: "May 28, 2026",
  status: "Research preview",
  subagents: "10s–100s",
  bunLines: "~750,000",
  bunTests: "99.8%",
  bunDays: "11",
};
