# Polymyalgia, Explained

An original interactive field guide to **polymyalgia rheumatica (PMR)** for the 0x4D44 Almanac. Research edition: **15 September 2026**.

The reading path has 12 chapters, nine numbered visual explainers, four trial summaries, a glossary and 29 numbered source entries. The core article is approximately 5,100 words before the glossary and bibliography; catalogue reading time is 26 minutes at 200 words/minute. Optional deeper sections and alternative trial panels are included in that estimate.

## Integration

- Route after merge and the normal Pages deployment: `/polymyalgia/`.
- The only existing content file changed is root `data.js`: one essay entry and membership of the Health and Science collections.
- Reuses `ill-dna`, already present in the almanac's illustration sprite.
- Uses the existing `/almanac-back.js` control. New fixed header tools leave the top-left pill clear.
- Does not change the home-page shell, global stylesheet, existing essays or deployment settings.
- Plain HTML, original inline SVG, scoped CSS and progressive-enhancement JavaScript. No runtime package installation or build step.

## Preview

Serve the **repository root**, not just this directory:

```sh
python3 -m http.server 8000
# Open http://localhost:8000/polymyalgia/
```

The article, warnings, citations and all four trial summaries remain readable without JavaScript. The native `details` elements still work. JavaScript adds the anatomy, signal, daily-rhythm, diagnostic-lens, artery-geometry, fraction, trial and cohort controls. No control diagnoses disease, recommends a dose or predicts a patient's outcome.

Print the whole guide from the top bar, or print the consultation-question sheet from chapter 12. Whole-guide printing includes every trial panel and expands deeper explanations; the prior expansion state is restored after printing.

## Tests

Test dependencies are separate from the website:

```sh
python3 -m pip install playwright==1.57.0
python3 -m playwright install chromium
python3 -m unittest discover -s polymyalgia/tests -v
```

To use an existing browser, set `CHROMIUM_EXECUTABLE`. For the optional automated accessibility audit, install `axe-core@4.10.3` outside the runtime tree and set `AXE_SCRIPT` to its `axe.min.js`. Set `PMR_TEST_OUTPUT` to retain screenshots and the audit JSON; otherwise a temporary directory is used.

The read-only `polymyalgia-checks.yml` workflow runs these checks for relevant pull requests. Coverage includes interactive outputs and selected states; trial values and scales; duplicate IDs and internal citation targets; responsive layouts at 320, 390, 768, 1440 and 1920 pixels; back-control clearance; keyboard activation; reduced motion; no-JavaScript content; both print modes; and catalogue/shelf integration. It also runs axe-core against WCAG A/AA rules and exports screenshots. Automated checks do **not** establish complete accessibility conformance or clinical validity.

## Evidence and editorial boundaries

This is an **AI-assisted narrative synthesis**, not a registered systematic review, clinical guideline or independently clinically reviewed patient leaflet. The page says this prominently. Before publication as medical information, obtain review from a qualified clinician, particularly for emergency wording and medication statements.

Source links and retrieval limitations are in `index.html#sources`. Important distinctions preserved throughout:

- The recommendations named **2025 EULAR recommendations** were published online in July **2026**. Their publicly accessible abstract was checked; the page does not claim full-text guideline extraction.
- SAPHYR compares strategies with different glucocorticoid tapers. Its remission endpoint includes CRP, which IL-6 blockade directly influences.
- The methotrexate trial randomised 64 people but reported 58 in the final analysis. Rounded percentages are not reverse-engineered into patient counts.
- PMR-SPARE's 16-week endpoint is not interchangeable with a 52-week sustained-remission endpoint.
- REPLENISH is current phase-3 evidence, not itself proof of a PMR licence or NHS access. The retrieved UK Cosentyx label did not list PMR.
- Sarilumab's UK PMR indication and Scottish Medicines Consortium non-submission advice are separate facts. The Scottish advice is not a completed negative efficacy appraisal or a UK-wide prohibition.
- The 77%, 51% and 25% long-term steroid figures pool heterogeneous observational cohorts, not one cohort followed through time and not individual remission predictions.

Orange figure badges identify schematics. Mint badges identify reported data. The daily curves, anatomical shapes and adrenal/disease sequence are original explanatory artwork, not digitised observations. There is no claim that motion or geometry on this page models clinical severity.

## Maintenance and privacy

Recheck guidelines, product labels, SMC advice and new trial reports before changing the edition date. Preserve each trial's population, denominators, endpoint and taper when updating numbers. If the content changes substantially, update `data.js` word count and reading time. Do not remove urgent GCA, weekly-methotrexate or abrupt-steroid-withdrawal safety wording without clinical review.

No analytics, third-party scripts, cookies, local storage, forms or health-data transmission are added. Checkboxes exist only in the open page. Outbound source links have their own privacy policies. The research disclaimer is not a substitute for maintaining accurate content.
