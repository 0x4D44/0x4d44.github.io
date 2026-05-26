// ============================================================
// 0x4D44 — document catalog
// Add/edit entries here. Each entry needs at minimum: title,
// tagline, url, date (YYYY-MM-DD), year (subject year), tag.
// readingMin and words are optional but shown when present.
// ============================================================

window.ESSAYS = [
  {
    slug: "ecml",
    title: "The Long Run",
    tagline: "A timeline of the East Coast Main Line, 1862–2025.",
    url: "https://0x4d44.github.io/ecml-timeline/",
    illustration: "ill-map",
    date: "2026-01-21",
    year: 2026,
    readingMin: 34,
    words: 8600,
    tag: "rail",
    real: true,
  },
  {
    slug: "ai-watched",
    title: "The AI Who Watched",
    tagline: "“Watch the cat,” she said. It watched. A fable on the gap between what we tell an AI and what we mean.",
    url: "https://0x4d44.github.io/the-ai-who-watched/",
    illustration: "ill-eye",
    date: "2025-11-02",
    year: 2025,
    readingMin: 14,
    words: 3300,
    tag: "fiction",
    real: true,
  },
  {
    slug: "br1955",
    title: "BR Modernisation Program",
    tagline: "British Railways' 1955 Modernisation Plan — a fleet that solved the wrong problem.",
    url: "https://0x4d44.github.io/br1955/",
    illustration: "ill-diesel",
    date: "2025-09-14",
    year: 1955,
    readingMin: 22,
    words: 5400,
    tag: "rail",
    real: true,
  },
  {
    slug: "vernier",
    title: "Vernier",
    tagline: "A field guide to quality, testing & agents.",
    url: "https://0x4d44.github.io/vernier/",
    illustration: "ill-caliper",
    date: "2026-05-26",
    year: 2026,
    readingMin: 203,
    words: 40658,
    tag: "software",
    real: true,
  },
];

// Tags shown in the filter row. "all" is always first.
window.TAGS = ["all", "rail", "fiction", "software"];

window.fmtDate = function (iso) {
  const d = new Date(iso);
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2,"0")} ${m[d.getMonth()]} ${d.getFullYear()}`;
};
