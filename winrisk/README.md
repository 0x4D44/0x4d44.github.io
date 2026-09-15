# Inside WINRISK

An interactive binary-autopsy exhibit for the 0x4D44 Almanac at `/winrisk/`.
Eight chapters, nine individually explained findings, eleven instruments.

This is an explanation of the repair, **not a browser port or an EXE emulator**.
Neither the original nor the repaired executable is distributed here.

## Run

From the repository root:

```sh
python -m http.server 8000
# Open http://localhost:8000/winrisk/
```

The site is plain HTML/CSS/native JavaScript modules. There is no build step,
CDN, analytics, third-party runtime, service worker or backend. Serve `.mjs` as
JavaScript. The shared `/almanac-back.js` provides the only Almanac back button.
The root `data.js` registers the exhibit in the Machine Room and Code shelves.

## Interact

* Inspect all ten executable segments and the recovered data layout.
* Change the attacker and defender dice, reverse defender roll order, and run
  the independent 10,836-case browser comparison.
* Explore message fall-through, invalid territory indices, the recorded
  elimination sequences, the deck cursor and Setup commit/Cancel/failure.
* Overlay original and repaired territory polygons; select all seven affected
  regions, toggle the end marker, zoom, and inspect recorded witness points.
* Inspect every manifest operation, including both complete helper byte strings.
* Identify a locally selected file by size and SHA-256. It is never uploaded,
  executed, modified, or persisted. Web Crypto needs HTTPS or localhost.

## Evidence and scope

`evidence/AUDIT.md`, `patch_manifest.json` and `test_results.json` are copied
from the supplied repair package. `exhibit.json` contains the actual extracted
segment data and all 42 polygon point lists, with the eight corrections and
seven geometric witnesses cross-checked against the manifest/results. Segment
role names are interpretations, not original source symbols. The original
bitmap is not distributed; the map is drawn from the extracted coordinates.

The original report is dated 14 September 2026; this exhibit is dated 15 September.
The original and repaired hashes are visible on the page and in the manifest.
The original binary's About-dialog and NE-description version labels disagree;
both are reported rather than silently reconciled.

The Python instruction-level regression suite from the supplied repair package
was rerun during preparation: all suites passed, including the complete combat
sweep (2,317 original disagreements; zero repaired). Windows APIs were test
doubles. **No native Win16 GUI launch or complete played game was validated.**
The browser models illustrate the findings; clicking “Run” does not execute
that Python harness or the original executable.

## Tests

```sh
npm --prefix winrisk test
node --check winrisk/app.mjs

# Optional browser suite (Python 3 + Playwright + Chromium):
python -m pip install playwright
python -m playwright install chromium
python winrisk/tests/browser_test.py
# Existing system Chromium can be selected with CHROMIUM_PATH.
```

The Node suite independently enumerates every legal dice combination, checks
card/Setup boundaries, verifies extracted geometry and all seven witness
classifications, and checks page references, IDs and evidence consistency.

The browser suite operates the controls, all segment and patch selections,
seven map witnesses, keyboard dice, Setup escaping, file rejection, no-JS
fallback and 320/390/768/1440 layouts. It also checks that the shared Almanac pill
does not cover a control. Screenshots are optional: `--screenshots /tmp/winrisk`.

In a runner that forbids browser URL navigation, `--injected` inlines local CSS
and code and supplies the three JSON responses in memory. That explicitly
limited mode was used for this PR's Chromium DOM/visual validation; it does not
verify HTTP fetching, native ES-module loading, or the secure-context Web Crypto
success path. Normal HTTP-mode tests remain available for those integration
checks. No browser policy was disabled to run the fallback.

## Maintenance

Keep the model independent of the DOM. Preserve static prose and evidence links
when adding instruments. Do not imply that a browser-model result is native
binary execution, or that 2,317/10,836 is a percentage of games affected. Do not
replace the extracted coordinates with an artistic map or quietly apply the
patch offsets to another executable version.
