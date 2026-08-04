# The Darwin Machine — adversarial design review dossier

**Date:** 1 August 2026  
**Reviewed artefact:** Initial design for a Rust/Wasm browser artificial-life laboratory  
**Method:** Two isolated role-based critiques followed by an integration pass. These are deliberately hostile design reviews, not claims of independent external experimental replication.

---

## Review A — artificial-life and experimental-evolution sceptic

### Brief

Assume the implementation team is excellent at emulators, visualisation and software architecture but is in danger of building a compelling story that outruns the experiment. Attack the design’s evolutionary claims, substrate assumptions, language, measurements and opportunities for counterfeit emergence.

### A1. “Random bytes become life” is currently smuggled into a supplied-replicator design

**Severity:** Critical

The proposed VM includes allocation, genome reading, child writing and division. Starting a known program in that environment can demonstrate mutation and selection, but it says almost nothing about the spontaneous origin of replication. Even calling a future preset “Life from Noise” risks implying that the same substrate solved abiogenesis.

**Required change:** Define separate experiment classes:

1. inoculated evolution from a supplied ancestor;
2. search for replicators within the ISA;
3. emergence from random interacting programs.

The third probably needs shared or interacting tapes and must disclose all scaffolding.

**Resolution:** Accepted. The final design has separate scientific framing, substrate IDs and milestones. Release one makes no random-emergence claim.

### A2. The language is recognisably Avida-like but novelty and attribution are unclear

**Severity:** High

NOP templates, complement matching, read/write heads, allocation and division have strong precedents in Avida and Tierra. Presenting them as obvious new choices would be poor scholarship. Conversely, blindly copying Avida would miss the chance to ask what this project changes.

**Required change:** Cite the precedents and state the deliberate differences: byte-complete encoding, explicit spatial environment, browser-first observability, exact cross-target replay, and a separate shared-soup substrate.

**Resolution:** Accepted and reflected in the ISA rationale and references.

### A3. The ISA may be beautifully specified and evolutionarily sterile

**Severity:** Critical

Humans are poor at predicting mutational neighbourhoods. A hand-written replicator can work perfectly while almost every one-step mutant fails. Building the entire UI before measuring this would be backwards.

**Required change:** Add a design gate that enumerates substitutions/deletions/insertions around candidate ancestors, measures viable descendants and tests competition. Refuse to freeze the ISA until it has meaningful neutral and beneficial variation.

**Resolution:** Accepted as Milestone 0 and the first implementation issue.

### A4. A minimal ancestor is a poor demonstration ancestor

**Severity:** High

A short efficient loop may have nowhere obvious to improve. The public may watch mutation produce mostly damage and conclude evolution does nothing.

**Required change:** Keep a minimal ancestor for correctness, but ship a deliberately clumsy, padded ancestor with several independent opportunities for shortening and efficiency gains.

**Resolution:** Accepted.

### A5. “Fitness-free” is overstated

**Severity:** High

The design has no scalar ranking function, but energy conversion, instruction costs, replacement and resource reactions are still a designed fitness landscape. Saying there is “no fitness function” without qualification invites criticism.

**Required change:** Say there is no *global explicit score or rank selection*. Call the remaining mechanisms artificial physics and disclose them. Logic-task rewards should be named resource reactions, not portrayed as naturally occurring insight.

**Resolution:** Accepted throughout the final wording.

### A6. Scheduling and replacement policy may dominate the result

**Severity:** Critical

Sequential traversal can create birth-order advantages. Replacement versus empty-cell reproduction can determine whether fast replicators, territorial stability or drift dominate. These are not implementation trivia.

**Required change:** Version and display occupancy policy. Resolve simultaneous target contention independently of traversal order. Provide comparative batch treatments.

**Resolution:** Accepted. Births are committed after the update using deterministic contention keys.

### A7. The design casually uses “species” without an operational definition

**Severity:** Medium

Exact genotype, lineage, ecological type and reproductive species are different concepts. Colouring every mutation as a species produces a misleading exhibit.

**Required change:** Use genotype, lineage and informal strain. Reserve species for experiments that define a clustering or reproductive criterion.

**Resolution:** Accepted.

### A8. Parasites are promised by a substrate that cannot support classic parasites

**Severity:** Critical

A private genome and private child buffer do not permit Tierra-style organisms to jump into or borrow another program’s replication loop. Calling a fast replacer a parasite would be theatre.

**Required change:** Distinguish metabolic cheaters, predators and code parasites. Defer true code parasitism to shared memory or explicit cross-execution.

**Resolution:** Accepted.

### A9. One browser run cannot substantiate selection

**Severity:** Critical

A takeover may be drift, spatial accident or one seed’s contingency. Assertions about advantages require replicated treatments and uncertainty.

**Required change:** Build a native batch runner, define competition/meltdown/bottleneck/evolvability assays, publish raw configurations and never write tests that demand one exact adaptive mutation.

**Resolution:** Accepted.

### A10. Mutation controls obscure genome-length effects

**Severity:** Medium

A per-byte rate means a 100-byte genome experiences twice the expected substitutions of a 50-byte genome. A slider showing only `0.5%` can mislead.

**Required change:** Display both configured rates and observed/expected mutation load per birth; record event counts in lineage data.

**Resolution:** Accepted.

### A11. Arbitrary old-age death adds an unnecessary pressure

**Severity:** Medium

If organisms already pay energy and can be replaced, a maximum age may introduce a generation-time pressure unrelated to the intended experiment.

**Required change:** Remove default age death. Make senescence an explicit treatment.

**Resolution:** Accepted.

### A12. The design confuses robustness with evolvability

**Severity:** High

A genotype whose mutants remain viable may still be unable to reach useful novelty. Conversely, a brittle replicator may access beneficial changes. “Many viable mutants” is not sufficient.

**Required change:** Measure multiple axes: viability, phenotypic variance, beneficial access, offspring fidelity and multi-generation adaptation. Do not collapse them into one evolvability score.

**Resolution:** Accepted in the feasibility and phenotype sections.

### Review A verdict

**Proceed only after the native ISA spike.** The project is scientifically worthwhile, but the supplied-ancestor release must be framed as experimental digital evolution, not spontaneous origin of life. The revised design is considerably stronger once it treats its own artificial physics as part of the experiment.

---

## Review B — hostile systems, web-platform and product reviewer

### Brief

Assume the science is sound but the implementation will be deployed into a large static GitHub Pages repository, run for long periods on phones and laptops, and opened years later with stale caches and old saves. Attack determinism, deployment, memory, protocol, accessibility and release scope.

### B1. Replacing the repository’s Pages pipeline is needless blast radius

**Severity:** Critical

A custom Rust build in global Pages deployment could break every existing static document. The project does not need server-side build magic at runtime.

**Required change:** Commit generated Wasm assets, pin the toolchain and add a focused rebuild/diff gate. Consider a custom Pages workflow only after there is a repository-wide reason.

**Resolution:** Accepted.

### B2. One mutable RNG stream will make replay fictional

**Severity:** Critical

Adding a statistic or changing organism scheduling will consume random values in a different order and rewrite history. JavaScript and Rust RNGs must not interleave.

**Required change:** Use a specified keyed/counter RNG with domains for scheduling, copy mutation, division mutation, organism `RAND` and interventions. Publish golden vectors.

**Resolution:** Accepted.

### B3. Floating-point environmental state threatens cross-browser equality

**Severity:** High

Even where Wasm arithmetic is specified, reduction order and future native optimisation can diverge. Exact replay should not depend on chart-quality floating point.

**Required change:** Use integer/fixed-point authoritative state and move float conversion to presentation.

**Resolution:** Accepted.

### B4. Seed plus events is not a durable save format

**Severity:** Critical

A bug fix, ISA change or resource update will make replay diverge. Users need actual checkpoints and precise version identity.

**Required change:** Save a full versioned checkpoint, event log and checksum. Treat old semantics as replay-only where necessary; never silently upgrade physics.

**Resolution:** Accepted.

### B5. A service worker can combine new JavaScript with old Wasm

**Severity:** Critical

A cache update race can create impossible protocol failures or, worse, plausible divergence.

**Required change:** Put the same build ID in app, Worker and Wasm; refuse mismatches; version cache names; test a stale fixture.

**Resolution:** Accepted.

### B6. JSON snapshots will erase the performance benefit of Rust/Wasm

**Severity:** Critical

Serialising thousands of organism objects 20 times a second will dominate execution and garbage collection.

**Required change:** Send a compact fixed-width grid buffer by transfer, pool buffers, and transmit detailed state only for selected organisms. Drop visual frames rather than blocking simulation.

**Resolution:** Accepted.

### B7. Keeping every organism’s ancestry is an unbounded leak

**Severity:** Critical

A population can create millions of births quickly. A complete tree and every old genome will eventually consume the tab.

**Required change:** Define active, fossil, aggregate and pruned history classes; retain an ancestry skeleton; apply explicit storage budgets; ensure pruning cannot affect live state.

**Resolution:** Accepted.

### B8. Canvas alone is not accessible

**Severity:** High

A `role=application` and arrow keys do not make a dense pixel field useful to a screen reader. The core science must exist in DOM.

**Required change:** Provide textual world summaries, keyboard cell traversal, a population/lineage list, DOM disassembly and charts with text/data alternatives.

**Resolution:** Accepted.

### B9. Imported saves are a denial-of-service format unless proven otherwise

**Severity:** Critical

A tiny header can request a 65,535 × 65,535 world or a billion genomes. Decompression can multiply the attack.

**Required change:** Enforce compressed/decompressed limits, dimensions, section sizes and counts before allocation. Fuzz the parser. Never deserialize raw Rust layout.

**Resolution:** Accepted.

### B10. Worker failure and Wasm panic recovery are unspecified

**Severity:** High

Long-running experiments will hit browser suspensions, out-of-memory conditions and code defects. A blank dish is not an acceptable recovery plan.

**Required change:** Add Worker heartbeat/watchdog, fatal diagnostics, termination/restart, and rotating valid checkpoints.

**Resolution:** Accepted.

### B11. Release-one scope is far too large

**Severity:** Critical

Replication, rich nutrients, movement, signalling, parasites, recombination, multicellularity, graphs, PWA, save/replay and random emergence is several projects. The foundational scientific and product risks are in replication and determinism.

**Required change:** Fence release one around three presets, inspector, lineage, replay and offline operation. Move richer ecology and new substrates to later milestones.

**Resolution:** Accepted.

### B12. Performance promises are currently invented numbers

**Severity:** High

No benchmark exists yet. “Millions of instructions” and “50,000 organisms” may be easy or misleading depending on layout and statistics.

**Required change:** Express budgets as provisional targets, benchmark in Milestone 0, publish hardware/browser details, and change defaults before reaching for threads.

**Resolution:** Accepted.

### B13. The native and Wasm implementations could quietly differ

**Severity:** Critical

Feature flags, integer widths, serialization and RNG implementations can diverge even with shared source.

**Required change:** Cross-target golden checksums at multiple updates, after intervention and after save/reload. Test in at least Chromium and Firefox.

**Resolution:** Accepted.

### B14. UI inspection can accidentally perturb simulation

**Severity:** Medium

If selecting an organism pauses it, consumes RNG or performs live assay work, observation changes the experiment in invisible ways.

**Required change:** Inspection is read-only. Single-stepping occurs on a frozen clone in a separate sandbox. Assays are labelled and do not mutate the live world.

**Resolution:** Accepted.

### Review B verdict

**Architecturally feasible, provided release one stays narrow and the static-deployment boundary is respected.** The strongest part of the revised design is that determinism is no longer merely “seeded RNG”; it is a complete versioned state contract from core to service worker.

---

## Integration audit

The final design incorporates every Critical and High finding. Medium findings are incorporated except where explicitly left as a post-spike numeric choice. No review finding was dismissed as “future implementation detail” when it affected scientific meaning, determinism, safety or release feasibility.

The remaining open empirical decisions are:

- exact default mutation rates;
- final standard-world dimensions on mobile;
- exact ISA energy-cost table;
- whether Bottleneck ships in 1.0 or 1.1;
- whether resource diffusion is enabled in the first public preset;
- measured Wasm size and throughput budgets;
- final title and visual treatment.

Those are deliberately deferred to the native/Worker feasibility spike rather than guessed in the design.
