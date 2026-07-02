export const DIFFICULTIES = {
  tutorial: {
    label: "Tutorial",
    turns: 6,
    pressure: 0.72,
    startingResearch: 34,
    startingTrust: 76,
    startingEconomy: 74,
    startingEthics: 84,
    startingAi: 62,
  },
  standard: {
    label: "Campaign",
    turns: 10,
    pressure: 1,
    startingResearch: 24,
    startingTrust: 66,
    startingEconomy: 68,
    startingEthics: 78,
    startingAi: 52,
  },
  crisis: {
    label: "Crisis",
    turns: 12,
    pressure: 1.22,
    startingResearch: 18,
    startingTrust: 58,
    startingEconomy: 60,
    startingEthics: 74,
    startingAi: 46,
  },
};

export const REGIONS = [
  { id: "north", name: "Northglass Arcology", trait: "Dense transit loops", infection: 34, cooperation: 52, labs: 48, economy: 72 },
  { id: "delta", name: "Delta Freeport", trait: "Rumour-prone docks", infection: 27, cooperation: 45, labs: 36, economy: 82 },
  { id: "ridge", name: "Ridge Farms", trait: "Long supply lines", infection: 18, cooperation: 64, labs: 28, economy: 66 },
  { id: "spire", name: "Spire Civic Zone", trait: "Media saturation", infection: 23, cooperation: 58, labs: 56, economy: 70 },
  { id: "sol", name: "Sol Array", trait: "Critical power grid", infection: 14, cooperation: 49, labs: 42, economy: 88 },
];

export const ACTIONS = [
  {
    id: "field-audit",
    name: "Field Audit",
    scope: "region",
    cost: { economy: 4 },
    cooldown: 1,
    text: "Send a mixed civic and technical team. Lowers local pressure and improves cooperation.",
    effect: { infection: -13, cooperation: 8, trust: 2 },
  },
  {
    id: "research-sprint",
    name: "Research Sprint",
    scope: "global",
    cost: { economy: 6, trust: 2 },
    cooldown: 1,
    text: "Fund safe analysis and simulation work. Raises research without naming real procedures.",
    effect: { research: 13, ethics: -1 },
  },
  {
    id: "civic-briefing",
    name: "Civic Briefing",
    scope: "region",
    cost: { economy: 3 },
    cooldown: 1,
    text: "Plain-language public updates. Improves trust and cuts misinformation drag.",
    effect: { trust: 8, cooperation: 6, misinformation: -10 },
  },
  {
    id: "supply-stabiliser",
    name: "Supply Stabiliser",
    scope: "region",
    cost: { research: 3 },
    cooldown: 2,
    text: "Move spare staff and essentials through boring official channels.",
    effect: { economy: 10, labs: 7, infection: -5 },
  },
  {
    id: "ai-delegate",
    name: "Delegate to AAC",
    scope: "region",
    cost: { trust: 5, ethics: 4 },
    cooldown: 2,
    text: "Let Administrative AI Control triage a region. Efficient, slightly unsettling.",
    effect: { ai: 10, infection: -17, cooperation: -4 },
  },
  {
    id: "ethics-review",
    name: "Ethics Review",
    scope: "global",
    cost: { economy: 2 },
    cooldown: 2,
    text: "Slow the dashboard down long enough for humans to stay in the loop.",
    effect: { ethics: 11, ai: -4, trust: 4 },
  },
];

export const EVENTS = [
  {
    id: "false-graph",
    title: "Misleading graph goes viral",
    text: "A clean-looking chart with made-up axes eats the morning news cycle.",
    effect: { trust: -7, misinformation: 11 },
  },
  {
    id: "neighbour-pact",
    title: "Neighbourhood pact forms",
    text: "Residents coordinate errands and checks without waiting for the dashboard.",
    effect: { trust: 6, cooperation: 5 },
  },
  {
    id: "aac-poem",
    title: "AAC writes a poem",
    text: "It is technically about logistics. Nobody is reassured.",
    effect: { ai: 5, trust: -3 },
  },
  {
    id: "quiet-lab",
    title: "Quiet lab breakthrough",
    text: "A dry model update makes several bad options unnecessary.",
    effect: { research: 10, infection: -4 },
  },
  {
    id: "supply-snag",
    title: "Supply contract snarls",
    text: "Three agencies agree the form is wrong and disagree about which form exists.",
    effect: { economy: -8, labs: -4 },
  },
  {
    id: "panel-leak",
    title: "Dashboard leak",
    text: "A screenshot of the red-button panel circulates before anyone explains it.",
    effect: { trust: -6, ethics: -3, ai: 4 },
  },
];

export const ACHIEVEMENTS = [
  { id: "first-shift", name: "First Shift", text: "Complete one run." },
  { id: "kindly-dashboard", name: "Kindly Dashboard", text: "Finish with ethics at 75 or higher." },
  { id: "model-citizen", name: "Model Citizen", text: "Finish with trust at 75 or higher." },
  { id: "quiet-week", name: "Quiet Week", text: "Finish with average regional pressure below 30." },
  { id: "aac-whisperer", name: "AAC Whisperer", text: "Finish with AI stability at 80 or higher." },
];

export const CODEX = [
  { id: "aac", title: "Administrative AI Control", body: "AAC is a fictional optimisation engine. It is good at queues and bad at vibes." },
  { id: "crisis", title: "Fictional crisis model", body: "The simulation uses invented meters and toy arithmetic. It is not medical, operational or scientific guidance." },
  { id: "retention", title: "Humanity retention", body: "Winning means retaining public trust, agency and civil texture, not merely lowering a graph." },
];
