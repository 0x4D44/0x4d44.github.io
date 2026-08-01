# Security and resource limits

The evolved programs are untrusted data interpreted by `darwin-core`; they are not WebAssembly modules and are never executed by the host CPU.

## VM boundary

An organism can read its own circular genome, manipulate eight integer registers, construct a bounded child, sense versioned world fields and request versioned world actions. It cannot access browser APIs, JavaScript objects, host memory, files, network, wall-clock time or arbitrary Wasm memory.

All 256 bytes decode to terminating instructions. Every memory access is bounds-checked or deliberately circular. Each organism receives a finite instruction budget per update. Genome, world, call-stack, child and history sizes are capped.

## Checkpoint import

- hard upload cap: 16 MiB;
- fixed `DWM1` envelope and save version;
- length checked before decoding;
- all configuration dimensions and genome lengths revalidated;
- build/substrate/ISA/RNG/physics versions checked;
- organism/cell cross-references and caps checked;
- no executable JavaScript, HTML or path data is interpreted from a save.

## Browser containment

The simulation runs in a dedicated Worker. A heartbeat detects a wedged Worker and offers the most recent automatic IndexedDB recovery checkpoint. The UI transfers compact grid buffers and limits snapshot cadence. Canvas resolution and device-pixel ratio are capped.

## Privacy

The application makes no API request and emits no telemetry. The service worker only caches same-origin static assets. Checkpoints and experiments leave the device only through an explicit file export or copied URL containing a preset and seed.
