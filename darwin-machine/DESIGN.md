# The Darwin Machine

## Design for an evolvable virtual computer in the browser

**Status:** Final integrated design after two adversarial review passes  
**Date:** 1 August 2026  
**Provisional Almanac slug:** `darwin-machine`  
**Provisional project title:** **The Darwin Machine**  
**North star:** *Can evolution eventually produce Windows 3.1?*  
**Release-one objective:** considerably less ambitious, but no less important: make one poor little program copy itself, mutate, compete, diversify and remain completely inspectable.

---

## 0. Executive decision

Build a deterministic artificial-life laboratory in Rust, compile the simulation core to WebAssembly, and run it inside a dedicated Web Worker on the existing static GitHub Pages site.

Every organism is a small executable genome for a deliberately mutation-tolerant virtual CPU. It gathers energy from a spatial world, constructs an offspring byte by byte, and divides. Copying errors alter the executable program itself. There is no global `fitness()` score in the normal experiments: programs become common only by leaving more viable descendants than their neighbours.

The first public release will begin with a hand-assembled, deliberately clumsy ancestor. It will demonstrate reproduction, mutation, selection, lineages, genome inspection, deterministic replay, extinction and an error catastrophe. It will **not** claim that life routinely appears from random bytes. “Life from noise” is a separate, later research substrate with different assumptions and much stricter evidence requirements.

The decisive architectural choices are:

1. **A normal Rust core, not a web-only simulator.** The same deterministic engine runs natively for tests and large batches, and in the browser through a thin Wasm bridge.
2. **A dedicated Worker, not the UI thread.** The simulation runs continuously without freezing the page. The main thread renders compact snapshots and handles accessible controls.
3. **A mutation-tolerant bytecode, not x86 in miniature.** Every byte is valid; control flow uses local templates rather than fragile absolute addresses; all instructions terminate and all accesses are bounded.
4. **A two-dimensional cellular world for release one.** Each cell contains at most one organism, local resources and environmental state. A shared Tierra-style memory soup is reserved for a later substrate because it changes the scientific question and is required for genuine code-hijacking parasites.
5. **Exact reproducibility is a product feature.** A run is identified by engine version, ISA version, substrate, world configuration, seed, ancestors and external interventions. The engine emits periodic state checksums and supports full checkpoints.
6. **Generated Wasm assets are committed to the project directory.** Release one does not replace the Almanac’s repository-wide GitHub Pages deployment. A focused build check proves that the committed `.wasm` and JavaScript glue match the Rust source.
7. **The first design gate is empirical.** Before polishing the UI, implement the VM natively, assemble the ancestor, enumerate its mutational neighbourhood, and measure whether the language actually permits useful variation. An elegant ISA that kills nearly every mutant is a failed ISA.

The result should feel like a cross between a petri dish, a debugger and a natural-history cabinet.

---

## 1. Product thesis

The central experience is simple:

> Every coloured speck is a running computer program. It must gather energy, copy its own instructions and survive its copying mistakes. Nothing has been told what the best program looks like.

The page should let a curious teenager start an experiment in seconds, while allowing an emulator author to click a creature and inspect the exact instruction responsible for a lineage taking over the world.

This is neither merely an animation nor merely a genetic optimiser. The genome is executable; replication is an algorithm encoded in that genome; mutations can change the algorithm; and ecological success is measured by descendants rather than an externally ranked score.

The project has four overlapping purposes:

- **An exhibit:** a vivid, comprehensible demonstration of mutation, selection, drift, competition and extinction.
- **A laboratory:** seeded experiments with controlled environmental laws, repeatable interventions and exportable evidence.
- **A virtual-machine project:** a small, beautifully specified computer whose design is shaped by evolvability rather than historical compatibility.
- **An open-ended toy universe:** a place where unexpectedly good, bad and parasitic strategies may emerge—and where the observer can discover exactly how they work.

Thomas Ray described artificial life as introducing natural selection into a logical medium governed by its own “physical laws”. Tierra and Avida established that executable digital organisms can be treated as experimental populations rather than metaphors alone. The Darwin Machine follows that tradition, but is designed first for browser-scale visibility, deterministic replay and approachable inspection.[1][2]

---

## 2. Goals, non-goals and design principles

### 2.1 Goals

Release one must:

- run entirely in a modern browser from GitHub Pages;
- use a Rust simulation core compiled to WebAssembly;
- keep the simulation off the main UI thread;
- execute arbitrary byte genomes safely and indefinitely within explicit budgets;
- allow a supplied ancestor to reproduce through instructions it executes itself;
- apply heritable substitutions, insertions and deletions;
- produce ecological selection without a hidden global fitness score;
- show individual genomes, disassembly, execution position, ancestry and parent/child differences;
- provide deterministic seeds, state checksums, save/load and replayable interventions;
- work offline after its first successful load;
- be responsive, keyboard operable, reduced-motion aware and understandable without relying on colour alone;
- integrate cleanly with the Almanac’s catalogue, shelves, shared navigation and project-specific test pattern;
- make claims that can be reproduced in native batch runs, rather than treating one attractive browser run as evidence.

### 2.2 Non-goals for release one

Release one is not:

- a quantitative model of bacterial mutation rates, DNA chemistry or mouse cloning;
- evidence that biological life is “just software”;
- a claim that random bytes will reliably produce self-replicators;
- a Tierra clone with a shared memory soup;
- a conventional genetic algorithm with genomes selected by a scalar score;
- a neural-network training system;
- a server-backed multiplayer service;
- a framework-heavy web application;
- a Wasm-threads demonstration;
- a route to actual Windows 3.1 within any responsible planning horizon.

That last item remains the project’s entirely responsible **irresponsible** planning horizon.

### 2.3 Principles

#### The laws must be visible

Energy costs, resource replenishment, replacement rules, mutation processes and task rewards are part of the artificial physics. They must be inspectable, versioned and included in a saved experiment. No important pressure should be hidden in UI code.

#### Evolution gets mechanisms, not answers

The VM supplies low-level operations such as reading its genome, writing a child and dividing. It does not supply `REPLICATE_SELF`. Organisms must implement the copy loop.

#### Robustness beats realism

Every byte decodes. Arithmetic wraps predictably. Searches are bounded. Invalid operations become explicit failures or no-ops. A mutation should usually produce a different program, not crash the universe.

#### Reproducibility beats incidental speed

No wall-clock time enters the authoritative state. Randomness is deterministic and domain-separated. Integer or fixed-point arithmetic is used for the evolutionary state. Native and Wasm builds must agree on golden checksums.

#### One run is a story; repeated runs are evidence

The browser may show a wonderful takeover. Any scientific wording—“this mutation is favoured”, “this treatment increases collapse”, “this architecture is more evolvable”—must be supported by replicated seeded batches and distributions.

#### The organism remains inspectable

The simulator must never become so biologically decorated that the actual program disappears. The live disassembly, genome bytes and lineage diff are first-class views.

#### Do not counterfeit emergence

A supplied ancestor is labelled as a supplied ancestor. A task that grants energy is labelled as a designed resource reaction. A random-program experiment states exactly which replication machinery is built into the substrate.

---

## 3. The public experience

### 3.1 Opening scene

The page opens on a quiet laboratory bench. At its centre is a dark circular or rounded-rectangular “dish”, initially containing one pale ancestral strain and a field of faint nutrients.

Suggested opening copy:

> **A petri dish full of programs.**  
> Every speck below is a tiny computer. To survive, it must harvest energy, copy its own bytes and launch a child. Copying mistakes change the program. Press **Begin** and watch one lineage become many.

The first-run path is deliberately guided:

1. The ancestor executes slowly enough that the user sees the read and write heads move.
2. Its first exact child appears.
3. Mutation is enabled at a low rate.
4. A descendant differs by one byte.
5. The user is invited to click it and compare its code with its parent.
6. Time accelerates and the dish fills.

The first minute must teach the causal chain: **instruction → copying → mutation → descendants → population change**.

### 3.2 Main laboratory layout

On desktop:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ The Darwin Machine     preset · seed · play/pause · speed · save    │
├──────────────────────────────────────────┬───────────────────────────┤
│                                          │ Selected organism         │
│              PETRI DISH                  │ lineage / age / energy    │
│                                          │ parent / children         │
│    spatial population + nutrients        │ genome / phenotype        │
│                                          │                           │
│                                          │ live disassembly          │
│                                          │ parent diff               │
├──────────────────────────────────────────┴───────────────────────────┤
│ population · diversity · genome length · births/deaths · timeline   │
└──────────────────────────────────────────────────────────────────────┘
```

On a phone, the dish remains the primary surface. The organism inspector and charts become labelled drawers beneath it. Critical controls remain reachable without opening a dense settings panel.

### 3.3 Dish rendering

Each cell can encode several properties without becoming visual noise:

- **hue:** lineage family;
- **shape or inner glyph:** broad state such as reproducing, starving or newly born;
- **brightness:** energy;
- **outline:** selected organism or fossil-worthy event;
- **small pulse:** a birth, death or successful task, disabled under reduced motion;
- **background texture:** local nutrient or toxin level.

Colour is not the sole channel. A monochrome/high-contrast mode and textual summaries must preserve the important distinctions.

Zoom levels:

- **World:** population patterns and waves.
- **Colony:** neighbouring lineages and resource gradients.
- **Cell:** organism glyph, read/write heads and current action.

### 3.4 Organism inspector

Selecting an organism pauses only the inspector, not necessarily the world. The panel shows:

```text
Organism           #0048_21B7
Lineage            L-019 “amber branch”
Genotype            7C4A… / 51 bytes
Generation          284
Age                 12,419 instructions
Energy              736 / 1,024
Successful children 6
Replication time    2,814 instructions
Parent              #0045_F19C
Birth mutations     1 substitution, 0 insertions, 0 deletions
```

Below that:

- raw bytes;
- symbolic instructions;
- instruction pointer;
- register values and flags;
- read and write heads;
- child-buffer progress;
- parent diff;
- current local resources;
- recent actions;
- a “pin as fossil” control.

A user can single-step a frozen clone of the organism in a small sandbox without perturbing the live population. This avoids turning inspection into an environmental intervention.

### 3.5 Population observatory

The bottom panel provides compact, linked plots:

- population and occupied cells;
- births and deaths per sample;
- dominant genotype share;
- lineage diversity;
- median genome length;
- median successful replication time;
- mutation load per birth;
- resource consumption;
- extinctions and environmental interventions.

Clicking a point on the timeline opens the nearest checkpoint or fossil rather than pretending that every frame has been recorded.

### 3.6 Presets

Release-one presets:

#### First Replicator

A 16-byte minimal test ancestor copies itself exactly. Mutation begins disabled, allowing the causal mechanism to be watched and understood.

#### Faster, Smaller

A deliberately clumsy 64-byte ancestor contains redundant copying work and neutral padding. Selection has room to discover shorter or faster descendants.

#### Mutation Meltdown

The same ancestor is exposed to a rising mutation rate. The user sees diversity first increase and then, in many runs, viable replication fail—the digital error-threshold experiment.

#### Bottleneck

A flourishing population is reduced to a small random sample, demonstrating drift, lost diversity and founder effects. This can be release 1.0 or 1.1 depending on schedule.

Post-release presets:

- **The Blue Nutrient:** a resource unlocked by a disclosed logic operation;
- **Changing Seasons:** periodically moving or changing resources;
- **Host and Parasite:** only after a substrate supports genuine code exploitation;
- **Life from Noise:** an explicitly experimental random-program substrate, never a relabelled supplied ancestor.

### 3.7 The Windows 3.1 milestone board

A small, optional “ridiculous roadmap” provides levity without corrupting the science:

```text
✓ exact self-copy
□ heritable beneficial mutation
□ parasite
□ communication
□ division of labour
□ interpreter
□ graphical organism
□ window manager
□ Program Manager
□ Solitaire
```

It is labelled **“Not a scientific metric”**. `WIN.COM` remains safely several geological eras away.

---

## 4. Scientific framing and experiment classes

The project must distinguish three very different questions.

### 4.1 Inoculated evolution — release one

A known self-replicator is inserted into the world. The experiment asks:

- Can mutation alter its replication algorithm?
- Which variants spread under the stated environment?
- How do mutation rate, population structure and resource rules affect adaptation and collapse?
- Which genome architectures are robust or evolvable?

This is the most reliable and immediately educational mode. It follows the broad experimental pattern of Tierra and Avida: begin with organisms capable of replication, then observe heritable change and ecological competition.[1][2]

### 4.2 Replicator discovery — native research mode

The native CLI searches small genome spaces, mutational neighbourhoods and damaged ancestors. It asks:

- How common are viable replicators under this ISA?
- What is the shortest replicator found?
- Which replicators can evolve, rather than merely copy once?
- What fraction of one-step mutants remain viable?

Prior digital-life work shows why those distinctions matter: viable replicators can differ greatly in their subsequent evolvability, and architecture can matter as much as raw replication ability.[3]

This mode may seed future browser presets, but its batch results must be retained with exact seeds and engine versions.

### 4.3 Emergence from random interactions — later substrate

A field of random non-replicating programs is allowed to interact and modify one another. The experiment asks whether a self-replicating organisation emerges without a supplied ancestor.

Recent work has demonstrated this in some computational substrates while also identifying a language in which replicators were possible but did not appear in the tested runs.[4] That is precisely why the Darwin Machine must not treat spontaneous replication as a guaranteed property of “random bytes”. It depends strongly on the interaction rules and language.

A credible version of this experiment probably needs:

- shared or interacting tapes rather than isolated private genomes;
- self-modification or pairwise execution;
- a much smaller language;
- enormous native batch runs;
- independent detectors for genuine replication;
- controls that exclude trivial copying supplied by the environment.

It is a separate substrate and will receive its own ISA/substrate version. It will not silently inherit conclusions from the release-one cellular world.

### 4.4 Terminology

The UI uses these terms carefully:

- **organism:** an active VM instance with a genome and state;
- **genome:** its executable byte sequence;
- **genotype:** an exact genome byte sequence;
- **lineage:** a genealogical branch descended from an ancestor;
- **strain:** an informal display grouping for closely related active genotypes;
- **phenotype:** measured behaviour such as replication time, resource use or task performance;
- **species:** avoided unless a particular experiment defines an explicit operational criterion.

The simulator is inspired by biology but does not claim that its rates, chemistry or units map directly to bacteria.

---

## 5. System architecture

### 5.1 Process architecture

```text
┌──────────────────────── browser main thread ─────────────────────────┐
│ HTML + CSS + vanilla JavaScript                                      │
│                                                                      │
│  controls      Canvas 2D renderer      accessible DOM summaries      │
│  charts        organism inspector      file import/export UI         │
│                                                                      │
│                       command / snapshot protocol                    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ postMessage
                               │ transferable ArrayBuffers
┌──────────────────────────────▼───────────────────────────────────────┐
│ dedicated module Web Worker                                         │
│                                                                      │
│ worker.js                                                            │
│  ├─ loads wasm-bindgen module                                        │
│  ├─ owns run loop and snapshot cadence                              │
│  ├─ owns IndexedDB adapter                                          │
│  └─ validates build/version handshake                               │
│                                                                      │
│ darwin_wasm.wasm                                                     │
│  └─ thin bridge to darwin-core                                      │
│       ├─ VM + ISA                                                    │
│       ├─ world + resources                                           │
│       ├─ scheduler + births                                          │
│       ├─ mutation + lineage                                          │
│       ├─ statistics + checkpoints                                    │
│       └─ deterministic codecs                                        │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────── native development ──────────────────────────┐
│ darwin-cli                                                           │
│  ├─ batch experiments                                                │
│  ├─ replicator search                                                │
│  ├─ mutational-neighbourhood analysis                                │
│  ├─ benchmarks                                                       │
│  └─ replay/checksum verifier                                         │
│                                                                      │
│ shares exactly the same darwin-core                                  │
└──────────────────────────────────────────────────────────────────────┘
```

The official Rust/Wasm tooling supports loading a `wasm-bindgen` module inside a Web Worker, and `wasm-pack` can produce modules for direct web use.[5][6]

### 5.2 Why one Worker and one authoritative simulation thread

Release one deliberately avoids Wasm shared-memory threads:

- the world is small enough for a well-written single-threaded VM;
- deterministic scheduling is straightforward;
- GitHub Pages deployment remains simple;
- no cross-origin-isolation dependency is introduced;
- bugs are reproducible from one instruction stream;
- independent native experimental runs can still be parallelised across host threads or processes.

If profiling later proves one world needs more CPU, optimisation comes before concurrency: compact data layout, cheaper statistics, lower snapshot cadence, batch interpretation and possibly a JIT-like decoded block cache. We will try very hard not to add protected mode.

### 5.3 Separation of responsibilities

`darwin-core` contains no DOM, browser clock, JavaScript RNG, storage or rendering code. It accepts commands and deterministic budgets and returns state or snapshots.

The Worker owns:

- run/pause/step state;
- batching policy;
- IndexedDB I/O;
- transfer-buffer pooling;
- build-ID validation;
- fatal-error containment and recovery.

The main thread owns:

- presentation;
- user input;
- accessible text and focus management;
- charts;
- download/upload affordances;
- no authoritative evolutionary state.

---

## 6. Determinism, randomness and versioning

Exact replay is not an afterthought. It shapes the core.

### 6.1 Authoritative time

The world has two counters:

- `update`: one scheduled opportunity for each cell in the world;
- `instructions`: total VM instructions executed.

Wall time affects only how quickly the browser requests more work. It never enters resource replenishment, mutation, scheduling, ageing or task inputs.

### 6.2 Random-number design

Do not use one mutable global random stream. A UI query, new statistic or debug trace must never alter future mutations.

Use a small, specified counter-based or keyed deterministic generator with published golden vectors. Random values are derived from domains such as:

```text
(seed, domain=SCHEDULER, update, cell)
(seed, domain=COPY_MUTATION, parent_birth_id, child_index, write_index)
(seed, domain=DIVISION_MUTATION, parent_birth_id, event_index)
(seed, domain=VM_RAND, organism_birth_id, rand_counter)
(seed, domain=INTERVENTION, intervention_id, item_index)
```

Properties:

- adding a chart cannot perturb evolution;
- replay can verify individual random decisions;
- native and Wasm produce the same values;
- independent organisms do not depend on one another’s incidental instruction counts;
- experiment domains can evolve without consuming a shared stream.

The exact algorithm and byte order are part of the engine specification and cannot change under the same RNG version.

### 6.3 Integer authoritative state

Use integer arithmetic for:

- energy;
- resource concentrations;
- diffusion/replenishment accumulators;
- instruction costs;
- age;
- task values;
- population statistics used by the engine.

Charts may convert values to floating point after a snapshot. If a future environmental model genuinely needs fractions, use specified fixed-point arithmetic with saturating or wrapping behaviour defined in the format.

### 6.4 Replay identity

A reproducible run is identified by:

```text
engine semantic version
save-format version
RNG version
ISA version
substrate ID and version
world-physics version
world configuration
root seed
ancestor genome(s) and starting positions
ordered external intervention log
```

A replay includes periodic 128-bit state checksums. A mismatch stops replay and reports the first divergent checkpoint rather than continuing with a plausible-looking alternative history.

### 6.5 Checkpoints as well as event logs

Seed plus events is not sufficient for durable saves after code changes. The system stores:

- a full versioned binary checkpoint;
- human-readable metadata;
- the external intervention log;
- optional earlier checkpoints/fossils;
- the checksum at save time.

Old engine versions may be replay-only if semantics change. The application never silently migrates an old world to new physics and calls it the same experiment.

### 6.6 Build handshake

`index.html`/`app.js`, `worker.js` and the Wasm module expose the same build ID. The Worker refuses to start if they differ, which catches stale service-worker combinations such as new JavaScript loading an old `.wasm` file.

The UI then offers a controlled refresh/update path while preserving local saves.

---

## 7. World model

### 7.1 Release-one substrate

The default world is a toroidal two-dimensional grid.

Provisional standard configuration:

```text
width × height          128 × 128 cells
organisms per cell      0 or 1
maximum genome          256 bytes
minimum genome          8 bytes
registers               8 × u32
call-stack depth        8
maximum energy          1,024 units
instructions/update     8 per active organism
resource channels       2 compiled; 1 used in the first presets
signal channels         2 compiled; disabled in first presets
```

These are configuration defaults, not biological constants. Tiny and large presets may change them within hard safety caps.

### 7.2 Cell state

Each cell contains compact authoritative fields:

```rust
struct Cell {
    occupant: Option<OrganismId>,
    resources: [u16; RESOURCE_CHANNELS],
    signals: [i16; SIGNAL_CHANNELS],
    toxin: u16,
}
```

The exact in-memory representation may use structure-of-arrays for speed. The conceptual model remains as above.

### 7.3 Organism state

```rust
struct Organism {
    birth_id: u64,
    parent_birth_id: Option<u64>,
    lineage_id: u64,
    genome: GenomeHandle,
    ip: u16,
    registers: [u32; 8],
    compare: OrderingFlag,
    read_head: u16,
    write_head: u16,
    call_stack: TinyStack,
    energy: u16,
    age_instructions: u64,
    age_updates: u32,
    generation: u32,
    orientation: Direction,
    child: Option<ChildBuffer>,
    vm_rand_counter: u32,
    phenotype_counters: PhenotypeCounters,
    last_status: StatusCode,
}
```

Genomes may be interned by exact byte content to avoid storing identical immutable vectors repeatedly. Collision handling always compares bytes; a hash is an index, not proof of identity.

### 7.4 Scheduler

At each update:

1. resource and signal fields advance once;
2. the engine derives a deterministic permutation of all cell indices from `(seed, update)`;
3. each organism present at the start of the update receives its fixed instruction slice;
4. death takes effect immediately when energy reaches zero;
5. successful `DIVIDE` instructions create birth intents;
6. after all starting organisms have run, conflicting birth intents are resolved deterministically;
7. accepted children become active at the start of the next update;
8. statistics and optional checksums are sampled.

A simple permutation can use a keyed start and a stride coprime to the number of cells, visiting every cell exactly once without allocating a shuffle array. The method and tie-breaking rules are specified and tested.

Newborns do not execute in the update in which they are created. This prevents a child placed in a not-yet-visited cell receiving an accidental same-update advantage.

### 7.5 Birth contention

`ALLOC_CHILD` creates a private child buffer and records a target direction; it does not reserve the cell. `DIVIDE` emits an intent.

If several parents target one cell in the same update, the winner is selected by a deterministic contention key derived from the seed, update, target cell and parent birth ID. This avoids making raw traversal order the hidden law of reproduction.

The environment defines the occupancy policy:

- **replace:** a successful child replaces any occupant at the target;
- **vacancy-only:** division succeeds only into an empty cell;
- **energy-duel:** parent and occupant energy contribute to a specified contest;
- **mixed:** a probability or cost specified in integer terms.

Release-one presets use either `replace` or `vacancy-only`, and display the choice. Replacement policy can strongly affect selection, so it is part of the versioned physics, not an implementation detail.

### 7.6 Energy and death

Every executed instruction has an explicit energy cost. Organisms also pay a small per-update maintenance cost. `UPTAKE` converts a local resource packet into energy up to the configured cap.

Death occurs when:

- energy reaches zero;
- an explicitly enabled environmental hazard kills the organism;
- an enabled interaction instruction succeeds;
- the user applies an intervention.

There is no arbitrary maximum age in the default experiments. An age-limit treatment may be added as an explicit environmental law.

### 7.7 Resource field

The first preset can use uniform local replenishment to make replication efficiency easy to understand. Later presets may enable integer diffusion and spatial sources.

For each resource channel, the configuration specifies:

- initial amount;
- maximum per cell;
- replenishment per update or period;
- diffusion fraction in fixed-point units;
- decay;
- energy conversion rate;
- whether `UPTAKE` requires a computation token.

Resource updates are double-buffered or otherwise order independent.

---

## 8. The virtual computer

### 8.1 Design objective

A conventional ISA is optimised for human-written programs, compilers and hardware. The Darwin VM is optimised for **surviving mutation while retaining enough structure for complex algorithms**.

Avida’s use of no-op modifiers, copy heads and template-based searches is a particularly useful precedent. Research on evolvable languages found that template design, complement matching, language complexity and genome-length mechanisms materially affect robustness and evolutionary rate.[3][7]

The Darwin ISA borrows those principles but uses a byte-complete encoding, eight explicit registers, spatial/environmental operations and strict versioned browser determinism.

### 8.2 Byte encoding

Every genome byte is a complete instruction:

```text
bits 0–4   operation class  (0–31)
bits 5–7   argument         (0–7)

operation = byte & 0x1f
argument  = byte >> 5
```

Consequences:

- all 256 byte values are valid;
- a random byte always decodes;
- substitution mutations distribute evenly across operation classes and argument values;
- disassembly is trivial and stable;
- there are no variable-length instruction encodings, except that branch/search instructions consume immediately following NOPs as templates.

### 8.3 CPU state

Each organism has:

- eight 32-bit unsigned wrapping registers, `r0`–`r7`;
- instruction pointer;
- comparison flag: less/equal/greater;
- circular genome read head;
- circular child write head;
- eight-entry return stack;
- VM-local random counter;
- status code from the most recent environmental or reproduction operation.

The genome is circular. Fetching past its end wraps to byte zero.

### 8.4 Register convention

For single-register operations, the argument selects `r[arg]`.

For binary operations:

```text
left  = r[arg]
right = r[(arg + 7) & 7]   // the preceding register, wrapping
result is written to r[arg]
```

This preserves a one-byte encoding while allowing every adjacent register pair.

All arithmetic wraps modulo `2^32`. Shifts and comparisons have specified unsigned semantics. No arithmetic instruction traps.

### 8.5 Instruction set

| Op | Mnemonic | Argument use | Semantics |
|---:|---|---|---|
| 0 | `NOP` | label A–H | No direct effect; forms templates and modifiers. |
| 1 | `ZERO` | register | Set `r[arg] = 0`. |
| 2 | `INC` | register | Wrapping increment. |
| 3 | `DEC` | register | Wrapping decrement. |
| 4 | `NOT` | register | Bitwise complement. |
| 5 | `MOV` | register pair | Copy preceding register into selected register. |
| 6 | `SWAP` | register pair | Exchange selected and preceding registers. |
| 7 | `ADD` | register pair | Wrapping addition into selected register. |
| 8 | `SUB` | register pair | Wrapping subtraction into selected register. |
| 9 | `XOR` | register pair | Bitwise XOR. |
| 10 | `NAND` | register pair | Bitwise NAND. |
| 11 | `SHL` | register | Shift left by one, discarding overflow. |
| 12 | `SHR` | register | Logical shift right by one. |
| 13 | `RAND` | register | Write deterministic organism-local random `u32`. |
| 14 | `CMP` | register pair | Set comparison flag from selected vs preceding register. |
| 15 | `IF_EQ` | — | Execute next complete instruction only if flag is equal. |
| 16 | `IF_NE` | — | Execute next complete instruction only if flag is not equal. |
| 17 | `IF_LT` | — | Execute next complete instruction only if flag is less. |
| 18 | `JUMP` | direction | Find complement of following template; jump after match. |
| 19 | `CALL` | direction | As `JUMP`, pushing address after local template. |
| 20 | `RETURN` | — | Pop bounded return stack; empty stack is a failed no-op. |
| 21 | `SYSTEM` | query | Write a system/organism property to `r0`. |
| 22 | `ALLOC` | target | Allocate child length `r0` at selected neighbour target. |
| 23 | `HEAD` | head operation | Reset, set, query or swap read/write heads. |
| 24 | `READ_SELF` | register | Read genome byte into register and advance read head. |
| 25 | `WRITE_CHILD` | register | Write low byte to child and advance write head; copy mutation may occur. |
| 26 | `DIVIDE` | — | Validate child and emit a birth intent. |
| 27 | `SENSE` | sensor | Read local/environmental information. |
| 28 | `MOVE` | direction | Request movement; may be disabled by the substrate. |
| 29 | `UPTAKE` | resource | Convert a bounded local resource packet into energy. |
| 30 | `SIGNAL` | channel/target | Write a bounded signal value; may be disabled. |
| 31 | `ACT` | action | Submit task, rotate, share, attack or other versioned interaction. |

Instructions 27–31 have stable meanings under an ISA version, but a world capability may disable an action. Disabled operations fail explicitly, set `last_status`, consume their specified instruction cost and otherwise make no change. Later ecology presets can enable capabilities without changing the meaning of old saves.

### 8.6 `SYSTEM` queries

`SYSTEM arg` writes one of these values to `r0`:

| Arg | Value |
|---:|---|
| 0 | current genome length |
| 1 | current energy |
| 2 | age in updates |
| 3 | generation |
| 4 | allocated child length, or zero |
| 5 | number of distinct child positions written |
| 6 | local primary-resource amount |
| 7 | last status code |

### 8.7 `HEAD` operations

| Arg | Operation |
|---:|---|
| 0 | reset both heads to zero |
| 1 | set read head from `r0 mod genome_length` |
| 2 | set write head from `r0 mod child_length`, or fail if no child |
| 3 | write read-head position to `r0` |
| 4 | write write-head position to `r0` |
| 5 | advance read head |
| 6 | advance write head |
| 7 | swap read and write positions where meaningful; otherwise fail |

### 8.8 Templates and mutation-tolerant control flow

A `JUMP` or `CALL` consumes the contiguous run of one to four `NOP` instructions immediately following it. That sequence is the local template.

NOP labels are paired:

```text
A ↔ B
C ↔ D
E ↔ F
G ↔ H
```

Equivalently, the complement of label argument `x` is `x XOR 1`.

Example:

```text
JUMP backward
NOP-A
NOP-B
```

searches backward for:

```text
NOP-B
NOP-A
```

Rules:

- search direction comes from the low bit of the instruction argument;
- search wraps at most once around the genome;
- the branch’s own template cannot satisfy the search;
- the nearest complete complement wins;
- success moves the instruction pointer to the first instruction after the matched template;
- failure continues after the local template and sets failure status;
- search work is bounded by genome length × four and has an explicit energy cost;
- a conditional skip skips the next **complete instruction**, including any template attached to it.

The purpose is not syntactic whimsy. Insertions or deletions near the start of a genome do not invalidate a table of absolute branch addresses. Template choices and complement matching are also experimentally measurable parts of evolvability.[7]

### 8.9 Safety invariants

For every possible byte sequence and CPU state:

- fetching an instruction is bounded;
- an instruction terminates;
- branch search is bounded;
- register arithmetic cannot panic;
- stack overflow/underflow returns failure rather than corrupting memory;
- genome and child heads wrap within validated lengths;
- environmental indices are checked or reduced safely;
- no instruction can call JavaScript, access Wasm linear memory arbitrarily, open a URL, allocate host memory without a cap, or execute native code;
- the host grants a fixed instruction budget before control returns to the Worker loop.

---

## 9. The ancestors

### 9.1 Minimal test ancestor

The design target is a compact ancestor of roughly sixteen bytes:

```asm
start:
    UPTAKE       resource-0       ; acquire a small energy packet
    SYSTEM       genome-length     ; r0 = own length
    ALLOC        random-neighbour  ; make a child buffer of r0 bytes
    HEAD          reset-both
    ZERO          r1               ; copied-byte counter

copy_target:                         ; complement of branch template
    NOP-B
    NOP-A
copy_loop:
    READ_SELF     r2
    WRITE_CHILD   r2
    INC           r1
    CMP           r1, r0
    IF_NE
    JUMP          backward
      NOP-A
      NOP-B
    DIVIDE
                                    ; circular genome returns to start
```

With mutation disabled, it must produce a byte-identical viable child. That is the core contract from which everything else follows.

### 9.2 Clumsy public ancestor

A nearly minimal ancestor gives evolution little visible room to improve. The public “Faster, Smaller” preset therefore begins from a deliberately inefficient 48–64-byte ancestor containing:

- redundant NOP padding;
- extra head resets;
- an unnecessarily expensive copy check;
- a longer template;
- perhaps a duplicated uptake step that often hits the energy cap.

It remains understandable in the disassembler, but deletion and restructuring can produce large, observable advantages.

The minimal and clumsy ancestors are versioned assets with source assembly, exact bytes, expected first-division trace and native/Wasm golden tests.

### 9.3 ISA feasibility gate

Before the ISA is frozen, the native tool enumerates:

- every one-byte substitution of both ancestors;
- every one-byte deletion;
- representative or exhaustive one-byte insertions where tractable;
- damaged ancestors at several mutation distances;
- random short genomes under strict compute budgets.

For each candidate it measures:

- whether it divides;
- whether its child divides;
- offspring fidelity;
- replication time and energy;
- genome length;
- eventual population growth in controlled competition;
- mutational robustness of its own neighbourhood.

The ISA is rejected or revised if, for example:

- almost all single mutations are lethal;
- trivial `ALLOC`/`DIVIDE` sequences create viable children without copying;
- only one extremely brittle replication architecture is possible;
- branch templates produce pathological accidental loops;
- no beneficial or neutral neighbourhood exists around the public ancestor;
- execution cost is dominated by template search rather than organism behaviour.

No numeric “acceptable evolvability” threshold is asserted before the spike. The report will publish the observed distributions and the decision rationale.

---

## 10. Reproduction and mutation

### 10.1 Child construction

`ALLOC` reads the requested child length from `r0` and validates it against world limits. On success it creates a private child buffer:

- initialised to `NOP-A`;
- with a write-coverage bitset;
- associated with a target neighbour;
- limited to one child buffer per parent;
- charged an explicit allocation cost.

`READ_SELF` reads the current genome byte and advances the circular read head.

`WRITE_CHILD` writes the low eight bits of its source register, applies any copying substitution, marks that child position as written and advances the circular write head.

### 10.2 Division validity

The strict release-one division rule requires:

- a valid allocated child length within limits;
- every child position written at least once;
- sufficient parent energy for division and transfer;
- a valid target under the world’s occupancy policy;
- no malformed internal state.

This prevents a two-instruction `ALLOC; DIVIDE` sequence from manufacturing a viable pre-filled child. Organisms can still evolve shorter offspring by requesting a shorter buffer and filling it completely.

A later permissive chemistry mode may allow partially written buffers, but it is a distinct substrate option because it greatly changes the ease of spontaneous replication.

### 10.3 Birth commit

On a successful birth intent:

- division-level insertion/deletion mutations are applied;
- resulting genome length is revalidated;
- the child receives a configured energy transfer;
- the parent pays division cost;
- the child starts with zeroed registers, heads at zero and instruction pointer zero;
- generation increments;
- parent and child IDs, exact birth mutations and genotype are recorded;
- the child becomes active next update.

The parent’s child buffer is cleared after success. Failure behaviour—whether the buffer is retained or discarded—is an explicit world rule; the initial worlds discard it to keep semantics simple.

### 10.4 Mutation classes

Release one:

- **copy substitution:** during `WRITE_CHILD`, replace the intended byte with a different uniformly selected byte;
- **insertion:** at division, insert a random byte at a random boundary;
- **deletion:** at division, remove one byte at a random position, respecting minimum length.

Later:

- segment duplication;
- segment deletion;
- inversion;
- transposition;
- recombination between parents;
- evolving copy fidelity or repair instructions.

Every mutation event is counted and attached to the birth record. “Mutation rate” controls are expressed both as configured probabilities and as the observed distribution of mutations per birth, so genome-length effects remain visible.

### 10.5 Default rates

Exact defaults are chosen after the native feasibility spike. Initial test ranges may include:

- substitution probability per written byte: `0` to `1%`;
- insertion probability per division: `0` to `2%`;
- deletion probability per division: `0` to `2%`.

These are artificial-world settings, not claims about bacteria. Presets display the resulting expected mutation load for the current genome length.

### 10.6 Selection without a global score

The default world never sorts genotypes by a supplied objective. A program becomes common only if its execution results in more accepted viable children over time.

That success can emerge from:

- copying fewer bytes;
- executing a cheaper loop;
- acquiring energy more effectively;
- choosing targets better;
- surviving environmental changes;
- exploiting enabled interactions;
- producing offspring robust to the current mutation regime.

The world still has designed laws, just as any experiment has apparatus. Those laws are disclosed and controllable.

---

## 11. Ecology and computational nutrients

### 11.1 Release-one ecology

Keep the first ecological model intentionally spare:

- one replenishing nutrient;
- instruction and maintenance energy costs;
- reproduction into neighbours;
- empty-space or replacement competition;
- local mutation;
- optional user catastrophes and bottlenecks.

This is enough to demonstrate selection and drift without hiding the VM under a game’s worth of ecology.

### 11.2 Logic resources

In a later preset, the environment exposes input values through `SENSE`. An organism may use normal arithmetic/logic instructions and call `ACT submit` with a result. A correct transformation releases a named resource or energy packet.

Examples:

- NOT;
- XOR;
- equality;
- maximum;
- short temporal memory;
- predicting a periodic environmental bit.

The UI states the reaction explicitly:

```text
Blue nutrient reaction
Inputs: A, B
Unlocked when submitted result equals A XOR B
Reward: 24 energy
Cooldown: 32 updates per cell
```

This is not a secret `fitness()` function. It is a designed metabolism in the artificial physics. Research language must still acknowledge that the designer chose which computations are rewarded.

### 11.3 Movement, signals and interaction

The ISA reserves stable operations for movement, signalling, sharing and attack, but first-release presets may leave them disabled.

When enabled, they require:

- explicit energy costs;
- deterministic collision resolution;
- bounded signal lifetimes;
- no unbounded cross-organism execution;
- phenotype counters so the observer can see what is happening;
- controls that compare worlds with and without the capability.

### 11.4 Parasites

A private-genome cellular world can support ecological freeloaders, but not the classic Tierra behaviour of a short program jumping into and using another program’s copy loop.

The design therefore distinguishes:

- **metabolic cheater:** obtains benefits produced by neighbours;
- **predator:** extracts energy or removes another organism;
- **code parasite:** relies on another organism’s executable machinery.

True code parasites require a shared-memory or cross-execution substrate and are deferred. The UI will not label an ordinary fast replacer “a parasite” merely because the story is attractive.

---

## 12. Lineages, fossils and observability

### 12.1 Identity

Each birth receives a monotonic 64-bit `birth_id`. Each exact genome receives a stable genotype record containing:

- length;
- exact bytes;
- stable hash for indexing;
- first-seen update;
- active count;
- total births/deaths;
- measured phenotypes.

Hash collisions are resolved by comparing bytes.

A lineage ID is inherited unless a configured branch rule creates a new displayed lineage—for example, a novel genotype that reaches a population threshold or a manually pinned branch. The underlying parent links remain exact.

### 12.2 Colour inheritance

Lineage colours are deterministic. A child inherits its parent’s hue; a significant branch receives a small deterministic shift. This keeps the dish visually coherent without asserting that each colour is a biological species.

Patterns or glyphs distinguish states for users who cannot rely on hue.

### 12.3 Bounded history

Retaining every organism and every genome forever would eventually consume all browser memory. Release one keeps:

- full state for active organisms;
- exact genotype records for active and fossilised genotypes;
- aggregate counters for extinct unremarkable genotypes;
- a bounded recent event ring;
- periodic full checkpoints under a storage budget;
- an ancestry skeleton connecting retained fossils and selected organisms;
- pinned records chosen by the user.

Pruning is deterministic and part of the run metadata. It may remove fine-grained historical detail, never alter the live simulation.

### 12.4 Automatic fossil triggers

A representative genome is retained when it is the first to:

- reproduce successfully;
- survive a new mutation class;
- set a replication-speed record by a meaningful margin;
- set a genome-length record while remaining viable;
- perform a new enabled task;
- exceed a configured population-share threshold;
- found a lineage that persists for a configured duration;
- survive an intervention that eliminates most of the population.

Fossil labels state why they were retained.

### 12.5 Phenotype measurement

Useful per-genotype measurements include:

- median instructions from birth to first accepted child;
- energy consumed per successful birth;
- offspring viability over controlled clone trials;
- resource uptake rate;
- task outputs;
- mutation robustness sampled from immediate neighbours;
- competitive growth in a specified assay environment.

Measurements that require clone assays run outside the live world, either in a bounded sandbox or native batch tool. The UI distinguishes observed live behaviour from assay results.

### 12.6 Explainable takeover

When a genotype rises rapidly, the system can construct a cautious explanation panel:

```text
What changed?
• Genome shortened from 61 to 48 bytes.
• Median first division fell from 3,102 to 2,414 instructions.
• Energy per accepted child fell by 18% in clone assays.
• This genotype rose from 4% to 57% of the population over 9,200 updates.

This is an association in this environment, not proof that genome length alone caused the takeover.
```

The wording avoids turning a convenient correlation into certainty.

---

## 13. Worker protocol and performance

### 13.1 Commands

Main thread to Worker:

```text
INIT(config, seed, ancestors)
RUN(batch_policy)
PAUSE
STEP_INSTRUCTIONS(n)
STEP_UPDATES(n)
SET_DISPLAY_RATE(hz)
SELECT_CELL(x, y)
INSPECT_ORGANISM(id)
CLONE_SANDBOX(id)
APPLY_INTERVENTION(event)
CREATE_CHECKPOINT(label)
SAVE(slot)
LOAD(slot)
EXPORT_SAVE
IMPORT_SAVE(bytes)
RESET
BENCHMARK(profile)
```

Worker to main thread:

```text
READY(build_info, capabilities)
SNAPSHOT(header, transferable grid buffer, chart samples)
INSPECTION(organism state, genome, disassembly, diff)
EVENTS(recent births/deaths/fossils/interventions)
SAVE_COMPLETE(metadata)
EXPORT_READY(bytes, suggested filename)
PROGRESS(kind, completed, total)
DIVERGENCE(expected, actual, checkpoint)
RECOVERABLE_ERROR(code, message)
FATAL_ERROR(code, diagnostic)
```

All protocol messages include a protocol version and request ID where relevant.

### 13.2 Run loop

The Worker runs deterministic work batches rather than “one frame’s worth of simulation”. A normal loop is:

1. execute up to a configured instruction/update budget;
2. yield to the Worker event loop;
3. process commands;
4. emit a snapshot if the display interval has elapsed in host time;
5. continue if running.

At maximum speed, simulation batches grow and snapshot frequency falls. The world advances identically whether rendered at 20 Hz, 2 Hz or not at all.

### 13.3 Snapshot format

The Worker does not serialise every organism into JSON. A standard 128 × 128 dish can be represented by one `Uint32` per cell—64 KiB—encoding display lineage, energy band and state flags. Additional resource texture can use a second compact buffer when visible.

Use a small pool of transferable `ArrayBuffer`s:

- Worker fills a free buffer and transfers ownership to main;
- main renders it and returns it for reuse;
- if no buffer is free, Worker skips a visual snapshot rather than stalling evolution;
- inspector details are sent only for the selected organism.

No `SharedArrayBuffer` is required in release one.

### 13.4 Provisional budgets

These are design targets to validate in the feasibility spike, not claims about completed software:

- standard world authoritative state below 64 MiB;
- total page memory below 128 MiB in a long standard run;
- smooth dish interaction at 30 rendered frames/s while snapshots arrive at 10–20 Hz;
- no more than one full-grid transfer per snapshot;
- initial compressed Wasm plus glue target below 1 MiB;
- max-speed simulation fast enough that visible evolution occurs in minutes on an ordinary current laptop;
- a reduced standard preset that remains usable on a recent phone.

The release report records measured instruction throughput, snapshot cost, memory growth and browser/device details. If the prototype misses these targets, it changes defaults before adding threads.

### 13.5 Failure containment

The Worker catches Wasm initialisation errors, explicit engine errors and failed save imports. A panic or stalled Worker does not take down the whole document:

- main-thread watchdog notices missed heartbeats;
- the user can terminate and restart the Worker;
- the latest valid automatic checkpoint remains available;
- diagnostic data contains build/version/checksum information but no private telemetry is sent anywhere.

---

## 14. Persistence, sharing and offline operation

### 14.1 Save contents

A `.darwin` export is a bounded container with:

```text
magic and container version
human-readable metadata
engine/RNG/ISA/substrate/physics versions
build ID
world configuration and root seed
full current checkpoint
checkpoint checksum
external intervention log
retained fossils and ancestry skeleton
optional earlier checkpoints
user notes and pinned organisms
```

The binary codec is explicitly versioned and endian-defined. It does not serialise raw Rust struct layout or rely on an unspecified `bincode` representation.

### 14.2 Browser storage

The Worker-side JavaScript adapter stores saves in IndexedDB, which is available in Web Workers. Autosave keeps a small rotating set, subject to a user-visible storage budget. Large history capture is opt-in.

The application works without persistent storage: failure or denial produces a clear warning and leaves export available where possible.

### 14.3 Import safety

Save files are untrusted input. The decoder:

- checks magic, versions and checksum;
- enforces compressed and decompressed size caps;
- validates dimensions before allocation;
- validates organism counts and genome lengths;
- rejects duplicate or impossible IDs;
- checks every index and section length;
- never evaluates code or treats bytes as JavaScript;
- reports unsupported old/new versions precisely.

### 14.4 Sharing

Small experiments can be represented by a URL containing preset, seed and a short list of interventions. The URL recreates the experiment only when engine/ISA versions match.

Full worlds are shared as `.darwin` files. The site does not upload them to a server.

### 14.5 Service worker

The PWA shell caches:

- HTML;
- CSS;
- `app.js`;
- `worker.js`;
- Wasm-bindgen glue;
- `.wasm`;
- manifest and icons;
- ancestor/preset assets if separate.

Cache names include the build ID. HTML uses an update-aware strategy; immutable build-named assets can be cache-first. The build handshake prevents mixed-version startup.

After one complete online load, an offline browser test must start a new experiment, run it, save it and reopen it.

---

## 15. Accessibility and responsive design

Canvas is a rendering surface, not an accessibility strategy.

Release one includes:

- semantic buttons, sliders, tabs and labelled regions;
- complete keyboard operation for play/pause, stepping, speed, presets and interventions;
- keyboard traversal of the dish by row/column, with a textual cell readout;
- an accessible population table/list alternative for the current viewport or selected lineage;
- textual live summaries at a restrained cadence;
- no information encoded by colour alone;
- high-contrast and colour-vision-safe palette checks;
- visible focus;
- 44-pixel-equivalent touch targets for primary controls;
- responsive layouts at 390 px, tablet and desktop widths;
- no horizontal page overflow;
- `prefers-reduced-motion`: decorative pulses, animated transitions and auto-scrolling stop, while the simulation may continue unless the user pauses it;
- charts with textual current values and downloadable data;
- disassembly that remains selectable text rather than painted glyphs;
- screen-reader announcements for major events only, not every birth.

The organism inspector uses ordinary DOM, so the core scientific information remains readable even if the Canvas is hidden.

---

## 16. Security and privacy

### 16.1 VM containment

The evolved program is not WebAssembly and is not JavaScript. It is interpreted data for `darwin-core`. Its instruction set exposes only bounded VM and world operations.

It cannot:

- read host memory outside its arrays;
- call browser APIs;
- access the network;
- create files;
- execute Wasm opcodes;
- generate JavaScript;
- escape its instruction budget;
- change world configuration except through defined instructions;
- allocate unbounded memory.

### 16.2 Application privacy

- no account;
- no cloud backend;
- no analytics or telemetry;
- no external runtime dependencies;
- saves remain in the browser or user-exported files;
- shared URLs contain only explicit experiment parameters;
- errors remain local unless the user chooses to copy them.

### 16.3 Resource exhaustion

Hard caps apply to:

- grid dimensions;
- genome and child sizes;
- organisms;
- stack depth;
- save sections;
- checkpoints;
- event history;
- mutation batch sizes;
- native/browser instruction budgets.

The native CLI has separate explicit high limits and never imports a browser save without validation.

---

## 17. Repository and deployment design

### 17.1 Proposed tree

```text
darwin-machine/
├── index.html
├── styles.css
├── app.js
├── worker.js
├── sw.js
├── manifest.webmanifest
├── icon.svg
├── ancestors/
│   ├── minimal-v1.json
│   └── clumsy-v1.json
├── pkg/                         # generated and committed
│   ├── darwin_wasm.js
│   ├── darwin_wasm_bg.wasm
│   └── build-info.json
├── rust/
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── rust-toolchain.toml
│   └── crates/
│       ├── darwin-core/
│       │   ├── Cargo.toml
│       │   └── src/
│       │       ├── lib.rs
│       │       ├── isa.rs
│       │       ├── vm.rs
│       │       ├── genome.rs
│       │       ├── organism.rs
│       │       ├── world.rs
│       │       ├── scheduler.rs
│       │       ├── resource.rs
│       │       ├── mutation.rs
│       │       ├── lineage.rs
│       │       ├── stats.rs
│       │       ├── rng.rs
│       │       ├── checksum.rs
│       │       └── codec.rs
│       ├── darwin-wasm/
│       │   ├── Cargo.toml
│       │   └── src/lib.rs
│       └── darwin-cli/
│           ├── Cargo.toml
│           └── src/main.rs
├── scripts/
│   ├── build-wasm.sh
│   └── verify-generated.mjs
└── tests/
    ├── validate-static.mjs
    ├── browser.test.mjs
    ├── offline.test.mjs
    └── fixtures/

wrk_journals/
└── 2026.08.01 - JRN - The Darwin Machine design.md
```

### 17.2 Rust build

Provisional build command:

```bash
wasm-pack build darwin-machine/rust/crates/darwin-wasm \
  --target web \
  --release \
  --out-dir ../../../pkg
```

Toolchain and dependency versions are pinned. Release profile settings prioritise deterministic behaviour and reasonable Wasm size; any size optimiser is itself pinned and checked.

### 17.3 Why generated files are committed

The Almanac currently treats each project as deployable static assets and has project-specific test scripts within a shared ESM repository. Release one should not introduce a repository-wide Pages build migration merely to compile one Wasm module.

Instead:

- Rust source and generated assets are committed together;
- a focused CI/test command rebuilds the module;
- the check fails if `pkg/` differs;
- GitHub Pages continues to serve the normal static tree;
- a future custom Pages workflow remains possible, because GitHub Pages supports Actions-based custom deployment, but is not needed initially.[8]

This minimises blast radius and keeps local/offline review simple.

### 17.4 Root integration

Add a root script similar to the repository’s existing focused gates:

```json
"test:darwin-machine": "...Rust tests... && ...Wasm build check... && node darwin-machine/tests/validate-static.mjs && node darwin-machine/tests/browser.test.mjs && node --check data.js"
```

The project is then added to the appropriate aggregate gate after its focused suite is stable.

### 17.5 Almanac catalogue proposal

```js
{
  slug: "darwin-machine",
  title: "The Darwin Machine",
  tagline: "A petri dish of executable life. Every coloured speck is a tiny program that must gather energy, copy its own bytes and survive its copying mistakes; inspect the code, rewind the lineage and change the laws of its world. A deterministic Rust simulation running locally in WebAssembly.",
  url: "https://0x4d44.github.io/darwin-machine/",
  illustration: "ill-darwin",
  date: "TBD",
  year: 1991,
  tags: ["simulation", "science", "software"],
  real: true,
}
```

Shelf placement:

- **The Science Bench**;
- **The Machine Room**.

It is a simulation rather than a Games Room entry: there is no required victory condition. Add an original `ill-darwin` sprite—perhaps a petri dish whose colonies subtly form a circuit trace—and include the shared `/almanac-back.js` navigation.

---

## 18. Test and evidence strategy

### 18.1 VM unit contracts

- all 256 byte values decode;
- each instruction has deterministic golden semantics;
- all arithmetic boundary cases wrap as specified;
- every branch/search terminates within its bound;
- template complement, wrapping and conditional-skip rules are exact;
- stack overflow/underflow cannot corrupt state;
- head operations stay within valid lengths;
- disabled environmental operations fail explicitly;
- an instruction slice always returns control to the host.

### 18.2 Reproduction contracts

- minimal ancestor makes a byte-identical child with all mutation disabled;
- child becomes active only on the following update;
- every required child byte is written;
- insufficient energy cannot produce a child;
- insertion/deletion respect length caps;
- parent/child lineage and mutation records are exact;
- target contention is independent of traversal implementation;
- save/load during a partial child copy resumes exactly.

### 18.3 Property and fuzz tests

- arbitrary genomes and valid worlds execute without panic or out-of-bounds access;
- random malformed save bytes are rejected safely;
- encode/decode round trips preserve state and checksum;
- scheduler permutations visit every cell exactly once;
- resource updates conserve or change totals according to the specified equation;
- mutation events fall within broad statistically justified bounds over large samples;
- genotype interning never equates unequal byte sequences;
- deterministic pruning never changes the live world;
- random UI command sequences cannot put the Worker protocol into an impossible state.

A release candidate should have executed at least tens of millions of cumulative random VM instructions under sanitised native fuzz/property runs, with the exact count reported rather than implied.

### 18.4 Cross-target determinism

For fixed fixtures, compare native Rust and Wasm under Chromium and Firefox at checkpoints such as:

```text
initial
1 update
10 updates
100 updates
10,000 updates
post-intervention
post-save/reload
```

The authoritative checksum must match exactly. The `wasm-bindgen-test` tooling supports headless browser execution, including Chrome and Firefox.[9]

### 18.5 Evolutionary assays

Avoid brittle assertions that one seed must evolve a particular byte. Instead run replicated batches.

Examples:

#### Competitive advantage assay

Place equal numbers of two exact genotypes in matched worlds over many seeds. Report takeover probability and growth-rate distribution. A shorter replicator is not declared fitter until the assay supports it in that environment.

#### Mutation meltdown assay

Run baseline and high-mutation treatments across repeated seeds. Compare extinction frequency, viable offspring fraction and time to collapse with uncertainty intervals.

#### Bottleneck assay

Compare retained genotype/lineage diversity before and after controlled bottlenecks over replicated runs.

#### Evolvability assay

For each candidate ancestor, enumerate or sample one-step mutants and measure viability, phenotypic variation and access to beneficial variants.

Batch outputs include configuration, engine versions, seeds, raw summary data and analysis script.

### 18.6 Browser acceptance

At desktop, tablet and 390 × 844 phone sizes:

- page starts cleanly;
- Wasm loads in the Worker;
- every release preset begins and advances;
- play, pause, step and speed controls work;
- selecting cells and organisms works by pointer and keyboard;
- disassembly and diff are readable;
- save, reload, export and import preserve checksum;
- reduced-motion behaviour is genuinely reduced;
- no horizontal overflow;
- no console errors or page errors;
- accessibility audit reports no serious violations;
- normal interaction remains responsive at the standard world size;
- an offline reload runs after the shell has been cached;
- a deliberately stale build-ID fixture is rejected safely.

### 18.7 Static and integration checks

- local assets only;
- no accidental external fonts, scripts or telemetry;
- unique IDs and valid references;
- manifest and service-worker shell complete;
- Wasm file present and matching build metadata;
- generated `pkg/` reproducible from pinned source/toolchain;
- catalogue entry, illustration and both shelf memberships valid;
- shared back button present;
- imported save size limits tested;
- JavaScript syntax checks and Rust formatting/lints clean.

---

## 19. Delivery plan

### Milestone 0 — language and feasibility spike

**Purpose:** prove that the attractive design is evolvable before building the attractive website.

Deliverables:

- `darwin-core` VM and exact ISA specification;
- assembler/disassembler for ancestor assets;
- minimal and clumsy ancestors;
- exact-copy traces;
- single-mutation-neighbourhood report;
- random/damaged-replicator search harness;
- native benchmark and memory model;
- native/Wasm checksum proof for a small fixture;
- decision: freeze, revise or replace ISA.

Exit gate:

- exact replication works;
- arbitrary genomes are safe;
- the mutational neighbourhood contains meaningful viable variation;
- no trivial non-copying route dominates;
- standard-world performance appears viable in a Worker.

### Milestone 1 — deterministic evolutionary core

Deliverables:

- grid world;
- resources and energy;
- scheduler and birth intents;
- substitutions/insertions/deletions;
- lineage/genotype records;
- statistics;
- full checkpoint and replay codec;
- native batch experiments;
- release-one presets as data.

Exit gate:

- repeated seeded populations demonstrate selection and mutation meltdown under documented treatments;
- save/replay checksums remain exact;
- bounded-history policy survives long runs.

### Milestone 2 — browser laboratory

Deliverables:

- Wasm bridge and Worker protocol;
- dish renderer;
- controls and guided first run;
- organism inspector and disassembler;
- timeline/charts;
- IndexedDB saves and `.darwin` import/export;
- accessible DOM alternative;
- responsive layout;
- build-ID handshake.

Exit gate:

- complete browser acceptance at standard world size;
- native/Wasm checksums agree;
- UI remains responsive at max simulation speed.

### Milestone 3 — Almanac release

Deliverables:

- visual polish and original illustration;
- offline PWA shell;
- catalogue and shelves;
- focused root test command;
- project work journal;
- browser, accessibility, performance and scientific evidence report;
- adversarial implementation review and fixes;
- merge-ready PR.

### Milestone 4 — richer ecology

Potential additions, each behind explicit capabilities:

- logic nutrients;
- resource gradients and seasons;
- movement;
- signals;
- sharing and predation;
- evolving fidelity;
- ecological cheaters;
- spatial catastrophes.

### Milestone 5 — new substrates

- shared-memory soup;
- code parasitism;
- pairwise interacting programs;
- random-program emergence experiments;
- recombination;
- multicellular grouping.

Each substrate receives a new version and separate scientific framing.

### Milestone 6 — the entirely sober route to Windows 3.1

- evolve an interpreter;
- evolve persistent external memory;
- evolve processes and messages;
- evolve graphical output;
- evolve a window manager;
- rediscover segmented memory for no defensible reason;
- generate `WIN.COM`;
- spend 400 million generations debugging `GDI.EXE`;
- evolve Solitaire;
- discover that Minesweeper was the apex organism all along.

---

## 20. Risks and mitigations

| Risk | Consequence | Mitigation |
|---|---|---|
| ISA is too brittle | Nearly all mutants die; demonstration stagnates | Milestone-zero neighbourhood enumeration before freeze; revise language empirically. |
| ISA makes replication trivial | Random `ALLOC/DIVIDE` programs look like life | Full-write division rule; explicit substrate labels; adversarial replicator search. |
| Designed ancestor is already near optimum | Little visible evolution | Ship a clumsy ancestor with measurable inefficiencies as well as the minimal test ancestor. |
| Replacement/scheduling laws dominate results | Misleading “natural” conclusions | Expose/version physics; deterministic contention; compare occupancy policies in batch assays. |
| One spectacular run is overinterpreted | Weak scientific claims | Replicated native treatments, raw results and cautious language. |
| Global RNG or floats break replay | Saves diverge across builds/targets | Domain-separated specified RNG, integer state, checksums and cross-target goldens. |
| UI snapshots consume more time than evolution | Max-speed mode disappoints | Compact transferable buffers, pooling, skipped frames and inspector-on-demand. |
| Lineage history grows without bound | Browser memory exhaustion | Fossils, aggregate extinct genotypes, deterministic pruning and storage budgets. |
| Service worker serves mixed JS/Wasm | Mysterious startup or replay bugs | Build-ID handshake and build-versioned caches. |
| Committed Wasm becomes stale | Source and deployment differ | Pinned rebuild-and-diff gate. |
| Save import allocates hostile sizes | Crash or denial of service | Strict container and section caps before allocation; fuzzed parser. |
| Canvas excludes keyboard/screen-reader users | Core experience inaccessible | DOM inspector, keyboard grid traversal, text summaries and accessible controls. |
| Scope expands into a full ecology before replication is sound | Beautiful but scientifically hollow release | Release-one scope fence; ecology capabilities deferred until core exit gates pass. |
| “Life from noise” becomes marketing shorthand | Counterfeit emergence claim | Separate substrate, explicit scaffolding labels and independent evidence. |
| Project accidentally becomes another emulator | Schedule expands by several operating systems | No I/O ports in release one. Review this decision monthly. |

---

## 21. Release-one definition of done

The first public version is complete only when all of the following are true:

1. The minimal ancestor produces an exact viable child with mutation disabled.
2. The clumsy ancestor supports viable one-step variants and produces observable evolutionary change across replicated runs.
3. All 256 byte values and arbitrary genomes execute within safety and instruction bounds.
4. There is no valid child without the configured copy-completion rule being met.
5. The same seed/configuration/interventions produce matching state checksums natively and in at least Chromium and Firefox Wasm runs.
6. A save exported during partial replication reloads to the same checksum and continues identically.
7. The standard world runs in a Worker without freezing ordinary UI interaction.
8. The First Replicator, Faster/Smaller and Mutation Meltdown presets are understandable and scientifically labelled.
9. A user can select an organism and see its exact genome, current instruction, parent diff and lineage.
10. Population statistics distinguish one illustrative run from replicated assay evidence.
11. Bounded-history and save budgets survive an extended run without unbounded memory growth.
12. Offline startup, simulation, save and reload work after first load.
13. Desktop, tablet and phone layouts have no horizontal overflow or serious accessibility defects.
14. The committed Wasm assets reproduce exactly from the pinned Rust source/toolchain.
15. Catalogue, icon, Science Bench and Machine Room integration pass the repository’s static checks.
16. The release journal records design decisions, empirical ISA results, adversarial findings, benchmark numbers and remaining limitations.
17. Nowhere does the page imply that Windows 3.1 has actually evolved. Yet.

---

## 22. Decisions changed by adversarial review

Two isolated review passes were conducted after the initial draft. They were role-separated critiques, not represented as independent external laboratories. The detailed memos are in the companion review dossier.

The integrated design changed materially:

- split supplied-ancestor evolution, replicator search and random emergence into separate experiment classes;
- chose the two-dimensional private-genome substrate for release one and deferred true code parasites;
- added an empirical ISA/mutational-neighbourhood gate before UI work;
- added a clumsy public ancestor rather than expecting a minimal replicator to optimise visibly;
- replaced a traversal-order birth rule with deterministic end-of-update birth contention;
- removed arbitrary age death from the default world;
- stopped using “species” as a casual synonym for genotype;
- required replicated batch assays for evolutionary claims;
- made environmental rewards explicit resource reactions;
- adopted domain-separated keyed randomness and integer authoritative state;
- added exact engine/ISA/physics versioning, periodic checksums and full checkpoints;
- bounded lineage/history retention;
- chose transferable snapshot-buffer pooling rather than JSON organism dumps;
- added a main/Worker/Wasm build-ID handshake for stale service-worker protection;
- retained the current static Pages deployment by committing generated assets;
- narrowed release one to replication, selection, mutation meltdown, inspection and replay;
- added explicit import limits, Worker recovery and accessible non-Canvas views.

---

## 23. References and design precedents

1. Thomas S. Ray, **“An Evolutionary Approach to Synthetic Biology: Zen and the Art of Creating Life”**, *Artificial Life* 1(1/2), 1994. <https://tomray.me/pubs/zen/>
2. Charles Ofria and Claus O. Wilke, **“Avida: A Software Platform for Research in Computational Evolutionary Biology”**, *Artificial Life* 10(2), 2004, DOI 10.1162/106454604773563612. <https://authors.library.caltech.edu/records/2h3br-gvn73>
3. Thomas LaBar, Christoph Adami and Arend Hintze, **“Does Self-Replication Imply Evolvability?”**, arXiv:1507.01903, 2015; and Nitash C. G. et al., **“Origin of Life in a Digital Microcosm”**, arXiv:1701.03993, 2017. These studies distinguish the ability to copy from the architecture’s capacity for subsequent evolution. <https://arxiv.org/abs/1507.01903> <https://arxiv.org/abs/1701.03993>
4. Blaise Agüera y Arcas et al., **“Computational Life: How Well-formed, Self-replicating Programs Emerge from Simple Interaction”**, arXiv:2406.19108, 2024. <https://arxiv.org/abs/2406.19108>
5. `wasm-bindgen` Guide, **“Wasm in Web Worker”**. <https://wasm-bindgen.github.io/wasm-bindgen/examples/wasm-in-web-worker.html>
6. Rust and WebAssembly Working Group, **`wasm-pack` Guide**. <https://rustwasm.github.io/docs/wasm-pack/>
7. Charles Ofria, Christoph Adami and Travis C. Collier, **“Design of Evolvable Computer Languages”**, *IEEE Transactions on Evolutionary Computation* 6(4), 2002, DOI 10.1109/TEVC.2002.802442.
8. GitHub Docs, **“Using custom workflows with GitHub Pages”**. <https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages>
9. `wasm-bindgen` Guide, **“Testing in Headless Browsers”**. <https://rustwasm.github.io/docs/wasm-bindgen/wasm-bindgen-test/browsers.html>

---

## 24. Proposed first implementation issue

> **Spike: prove the Darwin VM can reproduce and evolve before building the exhibit**
>
> Implement the byte decoder, bounded CPU, templates, child-copy operations, deterministic RNG and native CLI. Assemble the 16-byte minimal ancestor and the deliberately clumsy ancestor. Prove exact replication with mutation off; then enumerate all single substitutions/deletions and representative insertions, measuring viability, replication time, child fidelity and competitive growth. Compile the same core to a Worker-hosted Wasm smoke page and verify native/Wasm checksums. Return with the ISA report, benchmark and a recommendation to freeze or revise the language.

That is the right first piece of code. The petri dish comes after we know there is something worth putting in it.
