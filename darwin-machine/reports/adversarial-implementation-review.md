# Adversarial implementation review

This dossier records four deliberately hostile review passes applied while implementing The Darwin Machine. Findings are phrased as objections, not compliments. A finding is closed only by a code change, a behavioural oracle or an explicit scope boundary.

## Pass 1 — artificial-life scientist

### Objection: the exhibit could counterfeit “life from random bytes”

**Finding:** A polished petri dish makes it dangerously easy to imply abiogenesis even when the simulator supplies a complete replication algorithm.

**Disposition:** Closed. Every public preset is assigned an experiment class. The opening copy, About panel, `SCIENCE.md`, catalogue tagline and generated evidence call release one **inoculated evolution**. No random-byte preset is presented as spontaneous life. The native neighbourhood tool is labelled replicator discovery, not abiogenesis.

### Objection: an ISA can be self-replicating yet evolutionarily dead

**Finding:** Proving that one hand-written sequence copies says nothing about whether nearby mutations remain viable or can improve it.

**Disposition:** Closed by a build gate. The CLI verifies exact reproduction for both ancestors, then enumerates every one-byte substitution and deletion plus representative insertions. It records viable second-generation replicators and faster substitution mutants. The generated report is retained with the build. Failure of either supplied ancestor aborts the build.

### Objection: “species” and “fitness” invite biological overclaiming

**Finding:** Colour clusters are not automatically species, and a simulator-side score would turn ecology into ordinary genetic programming.

**Disposition:** Closed. The implementation uses exact genotype, lineage and strain terminology. There is no `fitness()` or score field. Energy, instruction cost, finite space, death and surviving reproduction are the selection mechanism. Logic resources are disclosed environmental reactions.

### Objection: one attractive seed is anecdote

**Finding:** A dramatic takeover in the browser is not evidence of a robust evolutionary effect.

**Disposition:** Closed for release claims. The CLI runs fixed multi-seed selection, mutation-meltdown and bottleneck assays and keeps raw per-seed outcomes. Browser runs are described as stories; replicated assays are evidence. Broader scientific claims remain out of scope.

### Objection: private child buffers make parasite stories false

**Finding:** A program cannot be a Tierra-style code parasite if it cannot execute another organism’s copier or write shared executable memory.

**Disposition:** Closed by scope. Release one never labels a fast replacer a parasite. True parasites are explicitly deferred to a separately versioned shared-memory substrate.

## Pass 2 — deterministic-systems engineer

### Objection: traversal order can become hidden selection pressure

**Finding:** Updating cells in a fixed row-major order lets position and “who ran first” determine resource capture and births.

**Disposition:** Closed. Each update visits every cell exactly once using a seed/update-derived affine permutation with a coprime step. Birth and move requests are gathered and resolved at update end. Contention keys depend on stable identities, not vector insertion order. Local resource capture and signalling remain deliberately schedule-mediated and are disclosed as substrate physics rather than claimed to be simultaneous. A unit test proves the scheduler is a permutation for world sizes 2–499.

### Objection: a global RNG makes observations perturb evolution

**Finding:** Adding an inspector, graph or debug draw could consume randomness and change the experiment.

**Disposition:** Closed. Scheduler, allocation, copying mutation, division mutation, VM randomness, contention, interventions, environmental inputs and movement use distinct keyed domains. `summary()` and grid inspection are pure. A test interleaves observability calls in one clone and proves the authoritative checksums remain equal.

### Objection: a weak checksum can certify different futures as identical

**Finding:** The first implementation omitted signal fields, heads, stacks, child targets, RNG counters and much configuration from its digest.

**Disposition:** Closed after review. The state checksum now covers semantic version identity, every world law, cells, organisms, child construction, free-slot order, genotype/history records (including vector boundaries and retired-history counters), interventions and interval state. Asset-build provenance is deliberately excluded because it cannot affect a future simulation step. The checkpoint envelope separately hashes the complete raw payload before decoding.

### Objection: “16 MiB cap” is not validation

**Finding:** A small malicious bincode payload can contain invalid cross-references, duplicate occupants, impossible child buffers or allocator state that later panics.

**Disposition:** Closed. Decode uses fixed-int, trailing-byte rejection and an input limit. Post-decode validation checks dimensions, counts, every cell/slot relationship, unique occupancy, free-slot integrity, genome and child bounds, child write bitmap consistency, energy, stack size, genotype maps and counts, history references and monotonic IDs. A test exports a correctly hashed but structurally inconsistent world and proves import rejects it.

### Objection: history grows until the tab dies

**Finding:** Bounding charts and fossils while retaining every extinct genotype still leaks memory indefinitely.

**Disposition:** Closed. The core deterministically retains active genotypes, active parents, fossils, the current dominant branch and the newest extinct records up to a hard-bounded configured cap, enforcing it at every externally observable update rather than only at chart-sampling boundaries. It remaps observational IDs without changing any live genome or VM state and increments an aggregate retired-genotype counter. A test forces pruning and validates the resulting checkpoint structure.

### Objection: native and browser arithmetic may diverge

**Finding:** Floating-point world state, timers or platform RNG would invalidate cross-target replay.

**Disposition:** Closed. Authoritative state and physics use integers only. Wall-clock time controls Worker batching and rendering cadence, never simulation results. Golden RNG vectors, checkpoint continuation and native/Wasm replay are build gates.

## Pass 3 — browser performance and accessibility reviewer

### Objection: maximum speed will freeze the page

**Finding:** Millions of bytecode instructions on the main thread would make controls, assistive technology and browser recovery unusable.

**Disposition:** Closed. The entire authoritative engine runs in a dedicated module Worker. It uses bounded wall-time batches, a heartbeat and a recoverable fatal state. Render cadence falls independently of simulation speed.

### Objection: JSON snapshots will dominate the simulation

**Finding:** Serialising thousands of cell objects several times per second is unnecessary allocation and transfer overhead.

**Disposition:** Closed. The Rust core emits an eight-byte packed cell buffer. The Worker transfers its `ArrayBuffer` ownership and will not issue another ordinary snapshot until acknowledged. Rich organism detail is fetched only for the selected cell.

### Objection: a canvas-only organism world is inaccessible

**Finding:** Colour pixels cannot be navigated or understood by keyboard and screen-reader users.

**Disposition:** Closed for release one. The canvas is focusable, arrow-key navigable and described by a live textual world summary. Dominant genotypes are mirrored into semantic tables and an accessible list. Selection exposes the full genome, CPU registers and disassembly in DOM. State is distinguished by brightness and debugger text as well as hue. Reduced-motion preferences are honoured.

### Objection: controls can hide under the Almanac back pill or overflow phones

**Finding:** The repository has a known class of mobile failures caused by the fixed shared back control and min-content grid tracks.

**Disposition:** Closed by layout and behaviour tests. Header content reserves the pill’s 112-pixel exclusion zone where needed; collapsed tracks use `minmax(0, 1fr)`; wide tables scroll in their own boxes. Browser acceptance runs at 390×844 and desktop, hit-tests controls with `elementFromPoint`, and the repo-wide responsive oracle checks horizontal overflow and back-pill overlap.

### Objection: a stale service worker can mix incompatible Wasm and JavaScript

**Finding:** Cache-first offline code can quietly load page, Worker and Wasm from different builds.

**Disposition:** Closed. Page and Worker import the same build constant; after Wasm initialisation the Worker asks the Rust core for its build ID and refuses a mismatch. The service-worker cache is build-named and old caches are deleted on activation. Browser acceptance restarts the full Wasm laboratory offline.

### Objection: a Worker crash silently destroys a long run

**Finding:** A frozen Worker looks like a paused experiment and can lose hours of state.

**Disposition:** Closed. Two-second heartbeats trigger a visible fatal recovery panel after eight seconds. User-data failures such as a corrupt checkpoint or missing browser save remain recoverable warnings rather than killing a healthy engine. The Worker writes an automatic IndexedDB checkpoint every thirty seconds, and manual local saves plus file export are available.

## Pass 4 — release, security and repository reviewer

### Objection: adding a build system to the Almanac root violates the repository model

**Finding:** The catalogue is deliberately static and should not require Rust or npm to serve.

**Disposition:** Closed. Rust lives entirely inside the self-contained project. Generated `wasm-pack` output is committed. The root receives only a catalogue object, SVG symbol, shelf membership and focused test commands. GitHub Pages serves static assets exactly as before.

### Objection: committed Wasm can drift from source

**Finding:** Reviewers cannot trust a binary merely because a source tree sits nearby.

**Disposition:** Closed. The pinned build workflow compiles with Rust 1.88.0 and wasm-pack 0.13.1, runs formatting, Clippy, unit tests, determinism verification, ancestor traces, neighbourhood analysis, assays and browser acceptance, then commits generated output. Pull-request validation rebuilds and requires a clean diff. SHA-256 values and sizes are written to `pkg/build-info.json`.

### Objection: evolved code might “escape”

**Finding:** The interesting security problem is not intelligence but accidental host capability or unchecked indexing.

**Disposition:** Closed at the substrate boundary. Organisms are byte arrays interpreted by Rust, not Wasm modules. They have no host imports, pointers, DOM, network, clock or filesystem. Every byte is a terminating instruction; execution budgets, genome sizes, world size, call stack, child buffers and imports are bounded. Arbitrary-genome tests exercise thousands of random byte strings without panic.

### Objection: the app could quietly transmit experiments

**Finding:** A share button, service worker or analytics include can undermine the promised local laboratory.

**Disposition:** Closed. Runtime assets have no external URL dependency. The service worker caches same-origin files only. There is no telemetry or API. Sharing copies a URL containing only preset and seed; saves leave the machine only through explicit export.

## Residual limitations accepted for this release

- Insertion-neighbourhood analysis samples eight representative byte values at each boundary rather than all 256; the report states exactly what was tested.
- The 128-bit digest is designed for deterministic divergence detection, not adversarial cryptographic authentication.
- “Blue Nutrient” demonstrates a disclosed computational ecology, not open-ended task invention.
- Private child construction excludes true code parasites and shared executable ecology.
- The roadmap to Windows 3.1 is, at present, mostly a remarkably disciplined font choice.
