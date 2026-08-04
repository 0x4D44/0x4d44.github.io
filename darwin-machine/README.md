# The Darwin Machine

A deterministic artificial-life laboratory for the 0x4D44 Almanac.

Every organism is a circular byte string executed by a deliberately mutation-tolerant virtual CPU. Organisms gather energy, construct children one byte at a time, mutate during copying, contend for finite space and die. There is no global fitness function: prevalence is the retrospective result of surviving reproduction under disclosed world rules.

The browser application runs entirely locally:

```text
DOM + Canvas UI
      │ structured commands / compact snapshots
      ▼
module Web Worker
      │ wasm-bindgen
      ▼
Rust darwin-core ── native darwin-cli
```

The same `darwin-core` crate drives the WebAssembly build, deterministic reference vectors, viability checks, mutational-neighbourhood analysis and native evolutionary assays.

## What release one demonstrates

- exact executable heredity from a supplied self-replicating ancestor;
- point mutation, insertion and deletion changing real bytecode;
- selection without a hidden score;
- drift, lineage loss, bottlenecks and extinction;
- replayable deterministic histories and complete checkpoints;
- live genome, CPU and parent-difference inspection;
- a bounded fossil record and population observatory.

It does **not** claim spontaneous life from random bytes. `First Replicator`, `Faster, Smaller`, `Mutation Meltdown` and `Bottleneck` are inoculated-evolution experiments. `The Blue Nutrient` is a richer disclosed ecology. Random-program emergence requires a later substrate and separate evidence.

## Source layout

```text
darwin-machine/
├── index.html, styles.css, app.js       browser laboratory
├── worker.js                            authoritative Worker controller
├── build-info.js                        page/Worker/Wasm handshake
├── sw.js, manifest.webmanifest          offline shell
├── rust/
│   └── crates/
│       ├── darwin-core/                 VM, world, evolution, saves, tests
│       ├── darwin-wasm/                 wasm-bindgen boundary
│       └── darwin-cli/                  trace, assay and benchmark tools
├── ancestors/                           canonical ancestor byte strings
├── pkg/                                 committed wasm-pack output
├── scripts/                             build, integration and report tools
├── tests/                               static and real-browser acceptance
└── reports/                             generated evidence and reviews
```

## Build

The root Almanac intentionally has no build requirement for visitors. Generated Wasm is committed. To reproduce it in a development checkout:

```bash
cd darwin-machine
./scripts/build-wasm.sh
```

The script expects Rust 1.88.0, the `wasm32-unknown-unknown` target and `wasm-pack` 0.13.1. It runs the Rust gates before producing `pkg/darwin_wasm.js` and `pkg/darwin_wasm_bg.wasm`.

## Validation

From the Almanac repository root:

```bash
npm run test:darwin-machine
```

Native gates:

```bash
cd darwin-machine/rust
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo run -p darwin-cli -- verify
cargo run -p darwin-cli -- neighbourhood all
cargo run -p darwin-cli -- assay all
```

All authoritative simulation values are integers. A build identity handshake rejects stale combinations of page JavaScript, Worker JavaScript and Wasm. Checkpoints carry semantic engine, ISA, RNG, physics, substrate and save-format versions plus a 128-bit state checksum; an asset-only release ID remains bounded provenance and does not make a compatible saved experiment unloadable.

## Privacy and safety

There is no network API, account, telemetry or remote persistence. Browser saves use IndexedDB. Imported checkpoints are capped at 16 MiB and validated before allocation. VM code has no host calls, filesystem, network, DOM, clock or JavaScript access.

## The Windows 3.1 objective

The sober roadmap is self-replication → ecology → interpreters → kernels → `WIN.COM` → Solitaire. The current release has completed the first box and is making irresponsible progress on the second.
