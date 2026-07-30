# Review 05 — hostile QA and performance reviewer

## Attack brief

Assume the attractive screenshots hide a broken control, stale reference, console error, huge payload, slow loop, inaccessible modal or untested branch.

## Findings and changes

- **Critical:** an early UI build referenced `commandPanel` without registering it in the DOM map. Fixed and added a selector/ID audit.
- **High:** the first mobile render overlapped controls. Captured and reviewed separate setup, active-game, move-choice, curse and rules states at desktop and phone dimensions.
- **High:** first-player randomness changed the RNG stream. Added deterministic opening-order and round-boundary tests, then repeated balance simulations.
- **Medium:** browser-managed localhost navigation was blocked in the execution environment. Used a clean Chromium target with production resources inlined via DevTools, preserving browser parsing/layout/runtime rather than substituting a DOM emulator.
- **Medium:** stale caches can disguise fixes. The service-worker cache is versioned and all final browser passes used fresh targets.
- **Medium:** script syntax and engine tests are independent release gates. Final checks run `node -c` on all scripts plus Node's native test suite.
- **Low:** total production source is small and dependency-free (roughly 150 KiB uncompressed before browser compression); SVG is generated in the DOM rather than shipped as raster assets.

## Verdict

Pass. No console errors remained; 13/13 tests and 1,500/1,500 simulated games completed.
