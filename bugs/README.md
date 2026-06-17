# Bug ledger

This `bugs/` directory **is** the bug ledger - one markdown file per bug,
**filename == the bug ID**, with the current **state a field inside** each file.
deltic's Repos->Bugs drill-in assembles the ledger in memory from `bugs/*.md`;
there is **no master table** by design, and **there is no `BUGS.md` - never
create one**.

For the generic fix/verify/close lifecycle see the fleet **`bug-tracking`** skill;
for this repo's fix-session specifics (gates, regression style, version policy,
runtime isolation) see **`../BUGFIX-GUIDE.md`** at the repo root.

## ID grammar
`PREFIX-TYPE-HOST-NNNNN` for newly minted bugs; legacy `PREFIX-NNNNN` ids stay
valid and are never rewritten.
- **PREFIX** - this repo's acronym: `ALM` (the 0x4d44.github.io "almanac" catalog).
- **TYPE** - `BUG` (the only type minted now); `REQ` is reserved for future use.
- **HOST** - the minting machine's normalized hostname (uppercase, `[A-Z0-9]`
  only, **not truncated**).
- **NNNNN** - a **per-host** sequence, zero-padded to 5, never reused.

## Allocating an ID (per-host)
Derive HOST at runtime (`echo %COMPUTERNAME%` on Windows, `hostname` on
WSL/Linux), normalize it, then take `max(SEQ) + 1` over the existing
`ALM-BUG-<HOST>-*` files. No central allocator, no cross-machine coordination.
Two actors sharing a HOST token (worktrees on one box, a Windows host and its WSL
with the same hostname) can mint the same SEQ from stale views; that surfaces as
a **loud** git add/add conflict at integration - renumber on conflict.

## States & transitions
`Open -> Blocked -> Fixed -> Closed`. Transitions are **dated and attributed**
(who + when + commit) and **append-only** - record a `State history:` line on
every transition; never silently overwrite a prior state.

## Two-eyes closure
The fixer flips a bug to **Fixed**; a **different** person re-verifies and flips
**Fixed -> Closed**. The fixer never closes their own bug.

## File format
Labelled lines (`- **State:**`, `- **Severity:**`, `- **Area:**`, `- **Raised:**`,
`- **State history:**`) under an `# <ID> — <title>` H1, then `## Observation` and
`## Notes` prose. **The state is a field inside the file; transition it by editing
that field, never by renaming the file.**

Example skeleton:

```markdown
# ALM-BUG-NOMAD-00001 — Filter chip "history" shows zero entries

- **State:** Open
- **Severity:** Medium
- **Area:** catalog
- **Raised:** 2026-06-17
- **State history:** Open (2026-06-17, raised by Arthur)

## Observation
<verbatim symptom, repro steps over http://localhost:8000/, expected vs actual>

## Notes
<root-cause, fix notes, links>
```
