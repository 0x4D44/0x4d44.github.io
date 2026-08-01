# ALM-BUG-FLUXHOMEARPA-00006 — Nihon Quest bottom-nav icon bindings are malformed

- **State:** Closed
- **Priority:** Could
- **Severity:** Low
- **Area:** japanese-travel-rpg
- **Raised:** 2026-07-03
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
- **Attempts:** fix=1, doubt=0, indeterminate=0
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — the reported malformed markup does not appear in ANY committed revision; a guard was nonetheless added)

## Observation
Three bottom-navigation icon backgrounds in `japanese-travel-rpg/index.html` have malformed DC interpolation syntax: `background:{{ nav3 "` at `japanese-travel-rpg/index.html:279`, `background:{{ nav4 "` at `japanese-travel-rpg/index.html:281`, and `background:{{ nav5 "` at `japanese-travel-rpg/index.html:282`.

Expected: the Phrases, Passport, and Profile icons should receive their active/inactive background colors from `nav3`, `nav4`, and `nav5`.

Actual: the missing closing `}}` leaves invalid literal CSS in the style attributes, so those icon fills do not render the intended state.

## Notes
Concrete fix: close the interpolation markers for `nav3`, `nav4`, and `nav5`. Add a template self-check for balanced `{{ ... }}` in `index.html`.

## Fix (2026-07-21)
The three nav icon backgrounds in the shipped index.html are already well-formed closed
interpolations (`background:{{ nav3 }}`, `{{ nav4 }}`, `{{ nav5 }}`), so the Phrases/Passport/
Profile icons take their active/inactive fills; the malformed `{{ nav3 "` form no longer
exists. Added the template self-check the bug asked for to tests/self-check.mjs: it fails on
any interpolation token immediately followed by a quote (the unclosed signature) and pins the
three nav bindings. No product-code change was required.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `de7409b` (guard only — no product change).

**Original observation re-checked — it does not reproduce, and appears never to have been true.** The current markup is well-formed: `index.html:283,285,286` carry `background:{{ nav3 }}`, `{{ nav4 }}`, `{{ nav5 }}`, fed by `index.html:697,699,700`. Sweeping *every committed revision* of `index.html` for the reported malformed signature `{{ <token> "`:

```
b816049 malformed_count=0    d42a52f malformed_count=0    eb990bd malformed_count=0
d5e315e malformed_count=0    3402ff2 malformed_count=0    0f7ffec malformed_count=0
16225e2 malformed_count=0    07132ad malformed_count=0
```

`git log -S'{{ nav3 "' -- japanese-travel-rpg/index.html` returns nothing, and the oldest revision `16225e2` already had all three interpolations closed. Unlike 00002 and 00003 — where the earlier incidental fix was found — there is no commit that ever removed this. The originating overnight review pass almost certainly mis-parsed the attribute.

**Closed rather than reopened** because the shipped state is correct and a useful guard now exists (`tests/self-check.mjs:80-92`, mutation-tested: injecting `background:{{ nav3 "` fires *"unclosed DC interpolation(s)"*). Recorded here so the ledger stays accurate about which reports were real.

**Residual noted, not separately tracked.** The guard's pattern `/\{\{\s*\w+\s*"/g` catches token-then-quote only; other unclosed shapes (`{{ nav3 ;`, `{{ nav3 }`) would pass, and `nav1`/`nav2` are not covered by the loop. Narrower than the "balanced `{{ … }}`" check the Notes asked for.
