# ALM-BUG-FLU-00019 — Waverley S-class file is 22 MB, relay serves 413 (16 MiB cap), so EB signal heads stay dark

- **State:** Open
- **Priority:** Should
- **Severity:** Medium
- **Area:** kings-cross-src/tools/sclass
- **Raised:** 2026-11-13T12:27:28Z
- **Discovery source:** Agent
- **Owner:** -
- **Owner role:** -
- **Owner run:** -
- **Owner host:** -
- **Owner branch:** -
- **Owner base:** -
- **Owner fingerprint:** -
- **Owner since:** -
- **Owner until:** -
- **Verify retry after:** -
- **Held branch:** -
- **Legacy fixed run:** -
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-11-13T12:27:28Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

**Observed (lead, 2026-11-13 12:30Z, live relay at main bc721d20):** the first Waverley (EB) S-class relearn published at 11:27Z ("candidate 87 bits/1 heads"), but `GET /sclass?area=EB` on the relay returns **413 file too large**. The published `<KX_DATA_DIR>/areas/EB/sclass.json` is 22,466,320 bytes; `relay/relay.mjs:35` caps served local JSON at `MAX_LOCAL_JSON = 16 MiB` (line 126 returns 413). Y9's published file is 2.97 MB.

**Cause (measured, by top-level key size of the serialised JSON):** `trace` ≈ 12.3 MB (bit transitions) and `hypotheses` ≈ 0.2 MB; the rest is small. The relearn publishes its whole analysis, trace included, as the file the browser fetches.

**Effect:** every EB signal head stays dark ("dark without data") even after a successful relearn, so M2's live layer shows nothing at Waverley.

**Also worth checking:** the relearn decoded only 1 head from 87 bits on its first run, so even when served the EB layer will light very little.

**Fix direction:** publish a trimmed served file (what the browser's signal layer reads: bits/berths/currentStates/hypotheses as needed) and keep the full analysis (trace) in a separate report file; or have /sclass serve a projection. Do not raise MAX_LOCAL_JSON to paper over it. Test with a synthetic area whose trace exceeds the cap.

Evidence fingerprint: `manual:v1:waverley-s-class-file-is-22-mb-relay-serves-413-e7eb3873a531f039`


## Fix

<unfixed — raised only>

## Notes
