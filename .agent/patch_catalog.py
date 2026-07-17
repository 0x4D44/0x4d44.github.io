from pathlib import Path

path = Path("data.js")
text = path.read_text(encoding="utf-8")

entry = '''  {
    slug: "transistor-packages",
    title: "Silicon on Sterling",
    tagline: "A true-scale visual atlas of transistor packages, from near-invisible DFN0603 to the lid-sized TO-3, laid over every current UK coin. Drag the parts, swap denominations, calibrate your screen to real size and line up the whole package family. Original SVG illustrations, vanilla JS; no build step.",
    url: "https://0x4d44.github.io/transistor-packages/",
    illustration: "ill-caliper",
    date: "2026-07-17T12:45:00",
    year: 1947,
    readingMin: 8,
    words: 820,
    tags: ["software", "engineering", "science"],
    real: true,
  },
'''

if 'slug: "transistor-packages"' in text:
    raise SystemExit("catalog entry already exists")

essay_marker = "window.ESSAYS = [\n"
if essay_marker not in text:
    raise SystemExit("ESSAYS marker not found")
text = text.replace(essay_marker, essay_marker + entry, 1)

tools_old = '''    slugs: ["broadband-speed-checker", "opus-verdict", "token-predictor",
      "midi-observatory", "cowork"] }'''
tools_new = '''    slugs: ["transistor-packages", "broadband-speed-checker", "opus-verdict",
      "token-predictor", "midi-observatory", "cowork"] }'''
if tools_old not in text:
    raise SystemExit("Tools shelf marker not found")
text = text.replace(tools_old, tools_new, 1)

science_old = '''    slugs: ["chicxulub", "starforged", "quantum", "randomness", "supernova", "hyperbolic", "strange-attractors",
      "logistic-map", "godel", "calculus", "driftfield", "paint-drying",
      "emdtime", "nettles", "gene-inheritance", "edinburgh-biosci",
      "ocean-currents"] }'''
science_new = '''    slugs: ["transistor-packages", "chicxulub", "starforged", "quantum", "randomness", "supernova", "hyperbolic", "strange-attractors",
      "logistic-map", "godel", "calculus", "driftfield", "paint-drying",
      "emdtime", "nettles", "gene-inheritance", "edinburgh-biosci",
      "ocean-currents"] }'''
if science_old not in text:
    raise SystemExit("Science Bench marker not found")
text = text.replace(science_old, science_new, 1)

path.write_text(text, encoding="utf-8")
