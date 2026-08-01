# 2026-08-01 — The Darwin Machine

Implemented the artificial-life design as a new self-contained Almanac project on `agent/darwin-machine`.

## Decisions

- Kept the authoritative simulation in a browser-independent Rust crate.
- Used a dedicated module Worker and transferable packed-grid snapshots.
- Began public experiments with supplied ancestors; no random-life claim.
- Shipped a 16-byte exact test replicator and a 64-byte deliberately clumsy public ancestor.
- Kept private child buffers for release-one safety and inspectability; true code parasites remain a later shared-memory substrate.
- Versioned engine, ISA, RNG, physics, substrate and save format independently.
- Used keyed randomness for scheduler, mutation, movement, contention and interventions so unrelated draws do not shift each other.
- Required native mutational-neighbourhood evidence before treating the ISA as viable.
- Kept the richer Blue Nutrient ecology behind a preset whose XOR energy law is explicit in the UI.

## Review sequence

1. Language/science review: attacked counterfeit emergence, lethal mutational neighbourhoods and unqualified “species” language.
2. Core/systems review: attacked traversal-order selection, global RNG drift, non-portable floating point, unbounded history and weak saves.
3. Browser/product review: attacked main-thread stalls, JSON grid snapshots, stale service-worker mixtures, inaccessible canvas-only state and Worker failure recovery.
4. Release/security review: attacked import allocation, remote dependencies, root build coupling and unreproducible generated Wasm.

Findings and concrete dispositions live in `darwin-machine/reports/adversarial-implementation-review.md`.
