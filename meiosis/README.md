# Meiosis — One of Each

A self-contained, progressively enhanced visual explainer for Scottish S6 / Advanced Higher Biology, intended for `/meiosis/` in `0x4D44/0x4d44.github.io`.

## Read it

Serve the repository and open `/meiosis/`:

```sh
python3 -m http.server 8000
```

The committed HTML includes the prose, static SVG diagrams, full-process atlas, glossary, transcript and worked practice. JavaScript enhances it with an 11-step chromosome player, lineage tracing, crossing-over and assortment experiments, chromosome/DNA counters, linkage calculations, non-disjunction and a scored quiz. No framework, CDN, account, telemetry or persistent storage. The only shared page dependency is the existing `/almanac-back.js`.

## Files and model

- `index.html`: committed page, usable without JavaScript.
- `page.template.html`, `build.js`: optional authoring source and deterministic generation.
- `model.js`: pure, inspectable two-pair chromosome-lineage model, shared by diagrams and counters. It is a teaching abstraction, not a molecular simulator.
- `diagrams.js`: original accessible SVGs, generated from the model where appropriate.
- `learning-data.js`: original quiz with answer-specific feedback and glossary.
- `app.js`, `style.css`: progressive enhancement, interactions, responsive/print presentation.
- `assets/meiosis-full-process.svg`: standalone full-process diagram with an explicit background.
- `catalog-entry.json`, `integrate-catalog.js`: additive Almanac registration and validation.

Chromosome identities survive both divisions. The model explicitly distinguishes sister separation from DNA replication, and whole-cell counts from per-pole counts during anaphase. Human mode scales counters only; it never pretends that the two-pair drawing shows all 46 human chromosomes. Colour is supplemented by M/P labels, chromosome numbers and dotted paternal tracks. The non-disjunction experiment is separately labelled as a simplified chromosome-type diagram.

## Edit and regenerate

```sh
node meiosis/build.js
node --test meiosis/tests/*.test.js
```

`index.html` and the SVG asset are generated output **committed to the repository**. GitHub Pages does not need an npm install or build. `content-stats.json` records a reproducible word count including the optional transcript and practice material, but excluding SVG text.

## Catalog integration

```sh
node meiosis/integrate-catalog.js --apply
node meiosis/integrate-catalog.js
```

This inserts one `window.ESSAYS` entry and one Science Bench membership into the existing root `data.js`. The root application, tag vocabulary and SVG sprite are untouched; the existing `ill-dna` symbol is reused. The script refuses an unrecognisable catalog and validates that unrelated entries and shelves are preserved. It is idempotent. The script treats the local repository's `data.js` as trusted source code.

## Tests

The Node test suite has no dependencies:

```sh
node --test meiosis/tests/*.test.js
```

Browser regression checks require Python Playwright and Chromium (development dependencies only):

```sh
python3 meiosis/tests/browser_test.py --chromium /usr/bin/chromium --output meiosis/test-output
```

The browser harness deliberately loads the exact page with local assets inlined, without network access. It exercises every stage and counter scale, all lab modes, the complete quiz, keyboard controls, modal focus, reduced motion, static fallbacks, print expansion and widths from 320 to 1440px. It uses the repository's existing shared back button for obstruction checks. This is not a substitute for a deployment test or cross-engine Safari/Firefox testing.

## Scientific scope

The June 2026 Advanced Higher specification is the course-scope reference. Stage names are present as navigation aids, not represented as required recall. Source links and modelling limitations are in the page itself. The main model uses two autosomal pairs, one illustrated reciprocal crossover and symmetric cytokinesis. Optional panels cover n/C accounting, cohesion, mapping limits, gametogenesis and other life cycles. All practice questions and indicative marking points are original, not official exam material.

## Review status

Content, model invariants, browser behaviour and visual layout were reviewed during authoring. Independent-agent review was requested but not available in the authoring session; no independent-agent sign-off is claimed. The delivery report records executed tests and outstanding coverage separately.
