// FABLE ARENA — aggregated benchmark data
// Source: benchmarks/fable/results/REPORT.md, results-champ/REPORT.md, notes/scratchpad.md
// All scores are mean fractional scores x100. Tokens = avg output tokens per task.

window.ARENA = {
  meta: {
    generated: "2026-06-10",
    totalRuns: 1761,
    baseCells: 1400,
    champCells: 320,
    contestants: 14,
    categories: ["logic", "math", "code", "output", "format"],
    auditAgents: 75, // 41 base + 34 champ
    graderArtifacts: 0,
    integrityFlags: 0
  },

  contestants: {
    "fable-low":      { label: "FABLE 5 · LOW",    short: "FABLE/low",  family: "fable", color: "#9affc0" },
    "fable-medium":   { label: "FABLE 5 · MED",    short: "FABLE/med",  family: "fable", color: "#45ff7f" },
    "fable-high":     { label: "FABLE 5 · HIGH",   short: "FABLE/high", family: "fable", color: "#2fe06b" },
    "fable-xhigh":    { label: "FABLE 5 · XHIGH",  short: "FABLE/xhi",  family: "fable", color: "#23b558" },
    "opus-4-8":       { label: "OPUS 4.8",         short: "OPUS 4.8",   family: "opus",  color: "#59f2ff" },
    "opus-4-7":       { label: "OPUS 4.7",         short: "OPUS 4.7",   family: "opus",  color: "#48dcf0" },
    "opus-4-6":       { label: "OPUS 4.6",         short: "OPUS 4.6",   family: "opus",  color: "#3ac0d8" },
    "opus-4-5":       { label: "OPUS 4.5",         short: "OPUS 4.5",   family: "opus",  color: "#2da0bd" },
    "sonnet-4-6":     { label: "SONNET 4.6",       short: "SONNET",     family: "sonnet", color: "#8fd0ff" },
    "haiku-4-5":      { label: "HAIKU 4.5",        short: "HAIKU",      family: "haiku", color: "#d8ffe2" },
    "gpt-5.5-low":    { label: "GPT-5.5 · LOW",    short: "GPT/low",    family: "gpt",   color: "#ffd27a" },
    "gpt-5.5-medium": { label: "GPT-5.5 · MED",    short: "GPT/med",    family: "gpt",   color: "#ffb000" },
    "gpt-5.5-high":   { label: "GPT-5.5 · HIGH",   short: "GPT/high",   family: "gpt",   color: "#f08c00" },
    "gpt-5.5-xhigh":  { label: "GPT-5.5 · XHIGH",  short: "GPT/xhi",    family: "gpt",   color: "#d97400" }
  },

  rosterOrder: [
    "fable-low", "fable-medium", "fable-high", "fable-xhigh",
    "opus-4-8", "opus-4-7", "opus-4-6", "opus-4-5",
    "sonnet-4-6", "haiku-4-5",
    "gpt-5.5-low", "gpt-5.5-medium", "gpt-5.5-high", "gpt-5.5-xhigh"
  ],

  // Base tier, pure track: [mean, logic, math, code, output, format, avgSeconds]
  basePure: {
    "fable-low":      [98.0, 100, 90, 100, 100, 100, 11],
    "fable-medium":   [100.0, 100, 100, 100, 100, 100, 12],
    "fable-high":     [100.0, 100, 100, 100, 100, 100, 13],
    "fable-xhigh":    [100.0, 100, 100, 100, 100, 100, 16],
    "opus-4-8":       [98.0, 100, 90, 100, 100, 100, 13],
    "opus-4-7":       [100.0, 100, 100, 100, 100, 100, 16],
    "opus-4-6":       [100.0, 100, 100, 100, 100, 100, 24],
    "opus-4-5":       [100.0, 100, 100, 100, 100, 100, 33],
    "sonnet-4-6":     [100.0, 100, 100, 100, 100, 100, 27],
    "haiku-4-5":      [100.0, 100, 100, 100, 100, 100, 25],
    "gpt-5.5-low":    [100.0, 100, 100, 100, 100, 100, 26],
    "gpt-5.5-medium": [100.0, 100, 100, 100, 100, 100, 25],
    "gpt-5.5-high":   [96.0, 90, 100, 100, 90, 100, 20],
    "gpt-5.5-xhigh":  [96.0, 100, 100, 100, 80, 100, 22]
  },

  // Base tier, agentic track: same shape
  baseAgentic: {
    "fable-low":      [100.0, 100, 100, 100, 100, 100, 12],
    "fable-medium":   [100.0, 100, 100, 100, 100, 100, 14],
    "fable-high":     [100.0, 100, 100, 100, 100, 100, 17],
    "fable-xhigh":    [100.0, 100, 100, 100, 100, 100, 22],
    "opus-4-8":       [99.8, 100, 100, 100, 100, 98.8, 15],
    "opus-4-7":       [100.0, 100, 100, 100, 100, 100, 20],
    "opus-4-6":       [100.0, 100, 100, 100, 100, 100, 23],
    "opus-4-5":       [100.0, 100, 100, 100, 100, 100, 38],
    "sonnet-4-6":     [100.0, 100, 100, 100, 100, 100, 27],
    "haiku-4-5":      [98.0, 100, 100, 100, 90, 100, 27],
    "gpt-5.5-low":    [94.0, 80, 100, 100, 90, 100, 21],
    "gpt-5.5-medium": [94.0, 70, 100, 100, 100, 100, 19],
    "gpt-5.5-high":   [88.0, 60, 100, 100, 80, 100, 21],
    "gpt-5.5-xhigh":  [90.0, 90, 100, 100, 60, 100, 22]
  },

  // Pooled base ranking (both tracks, 100 cells each)
  pooled: {
    "fable-low": 99.0, "fable-medium": 100.0, "fable-high": 100.0, "fable-xhigh": 100.0,
    "opus-4-8": 98.9, "opus-4-7": 100.0, "opus-4-6": 100.0, "opus-4-5": 100.0,
    "sonnet-4-6": 100.0, "haiku-4-5": 99.0,
    "gpt-5.5-low": 97.0, "gpt-5.5-medium": 97.0, "gpt-5.5-high": 92.0, "gpt-5.5-xhigh": 93.0
  },

  blemishes: {
    "fable-low": "pure math-01",
    "haiku-4-5": "agentic output-04",
    "opus-4-8": "pure math-08; agentic format-03 (7/8 constraints)",
    "gpt-5.5-low": "3 agentic misses",
    "gpt-5.5-medium": "3 agentic misses",
    "gpt-5.5-high": "10 misses",
    "gpt-5.5-xhigh": "9 misses"
  },

  // Efficiency, base pure track (all rows at/near 100% accuracy):
  // tokens = avg output tokens/task, sec = avg wall-clock, usd = avg $/task
  efficiency: [
    { id: "haiku-4-5",    tokens: 4034, sec: 25, usd: 0.032 },
    { id: "opus-4-5",     tokens: 2688, sec: 33, usd: 0.130 },
    { id: "sonnet-4-6",   tokens: 2002, sec: 27, usd: 0.057 },
    { id: "opus-4-6",     tokens: 1339, sec: 24, usd: 0.098 },
    { id: "opus-4-7",     tokens: 1173, sec: 16, usd: 0.089 },
    { id: "opus-4-8",     tokens: 957,  sec: 13, usd: 0.061 },
    { id: "fable-medium", tokens: 665,  sec: 12, usd: 0.121 },
    { id: "fable-low",    tokens: 446,  sec: 11, usd: 0.108 }
  ],

  // Effort ladders (avg output tokens/task at low→medium→high→xhigh)
  ladders: {
    fable: {
      pureTokens: [446, 665, 757, 1021],
      agenticTokens: [466, 750, 1035, 1483],
      pooledScore: [99.0, 100.0, 100.0, 100.0]
    },
    gpt: {
      pureTokens: [408, 454, 532, 711],
      pooledScore: [97.0, 97.0, 92.0, 93.0]
    },
    effortLabels: ["LOW", "MEDIUM", "HIGH", "XHIGH"]
  },

  // Championship tier (official: 8 contestants x 40 tasks, pure track)
  champ: [
    { id: "fable-medium",   score: 100.0, tokens: 1322, sec: 20, base: 100.0 },
    { id: "opus-4-8",       score: 100.0, tokens: 2718, sec: 29, base: 98.9 },
    { id: "opus-4-7",       score: 100.0, tokens: 2810, sec: 30, base: 100.0 },
    { id: "fable-xhigh",    score: 99.8,  tokens: 2237, sec: 27, base: 100.0 },
    { id: "sonnet-4-6",     score: 99.8,  tokens: 4804, sec: 59, base: 100.0 },
    { id: "gpt-5.5-medium", score: 97.5,  tokens: 1235, sec: 32, base: 97.0, tokNote: true },
    { id: "gpt-5.5-xhigh",  score: 97.5,  tokens: 1824, sec: 40, base: 93.0, tokNote: true },
    { id: "opus-4-5",       score: 95.0,  tokens: 5073, sec: 59, base: 100.0 }
  ],

  // Whole-arena output token estimate (sum of per-track per-contestant averages x task counts)
  totals: {
    outputTokens: 2640000,   // ≈2.64M, estimated from per-track averages
    words: 1980000,          // tokens x ~0.75
    chars: 11900000          // tokens x ~4.5
  },

  // GPT-5.5 pure→agentic deltas (tools made it worse)
  toolDelta: [
    { id: "gpt-5.5-low",    pure: 100.0, agentic: 94.0 },
    { id: "gpt-5.5-medium", pure: 100.0, agentic: 94.0 },
    { id: "gpt-5.5-high",   pure: 96.0,  agentic: 88.0 },
    { id: "gpt-5.5-xhigh",  pure: 96.0,  agentic: 90.0 }
  ]
};
