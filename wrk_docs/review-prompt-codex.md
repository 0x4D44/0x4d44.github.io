# External design review request (fresh eyes, one pass)

You are an independent external reviewer from a different model family,
deliberately decorrelated from the design's author. This is a READ-ONLY
review: do not modify any files.

## What to review

Design document:
`D:/worktrees/0x4d44.github.io/20260716-DEV-HUM-chief-engineer-game/wrk_docs/2026.07.16 - HLD - chief-engineer-game.md`

Supporting research (context, optional to read):
`D:/worktrees/0x4d44.github.io/20260716-DEV-HUM-chief-engineer-game/wrk_docs/research/`

Repo conventions the design must fit (skim as needed):
`D:/worktrees/0x4d44.github.io/20260716-DEV-HUM-chief-engineer-game/CLAUDE.md`
`D:/worktrees/0x4d44.github.io/20260716-DEV-HUM-chief-engineer-game/lessons_learnt.md`
Exemplar existing game dirs in the same tree: `shipshape/`, `tidecall/`,
`onu/` (tests layout, validate-static patterns).

## Context

The design is for a new self-contained browser game ("Chief Engineer" — a
cruise-ship engine-room management sim, six stepped levels) on a static
GitHub Pages almanac site. Vanilla JS, no build step, pure engine + node
tests + a headless-Chrome browser test. The design has already been through
one adversarial review round (see its §8 review record); you are the
cross-family fresh-eyes pass.

## What I want from you

Critique for: (1) internal consistency and correctness of the simulation
model (units, arithmetic, state/serialization design); (2) implementability
without mid-build redesign (is anything load-bearing still unspecified?);
(3) scope realism for a single self-contained web game; (4) game-design
soundness (tutorialization, pacing, scoring); (5) anything the previous
reviews plainly missed.

Do NOT re-litigate style or repeat the §8 record's already-folded findings
unless you believe a fold is wrong. Findings must be specific and actionable:
number them X1, X2, ...; severity CRITICAL / MAJOR / MINOR each; one short
paragraph each with a concrete suggested fix. If the design is sound in an
area, say nothing about it. Target the 5-10 most valuable findings. End with
a one-line overall verdict: BUILD / BUILD-WITH-FIXES / REDESIGN.
