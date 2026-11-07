# Wear library regeneration on the PR #81 bodies

Status: source restoration and regeneration in progress. This is not a clearance
certificate. No result from PR #85 or the interrupted earlier v2 run is reused.

The branch starts at the requested base
`38542092094aaf0101cc9920fd8628fcdaf0ac35`. On 2026-11-03,
`git rev-parse origin/main` returned
`2b0af7cfbde7c77ec8645ed8cd03f6b57d6556b5`, and
`git merge-base --is-ancestor 38542092094aaf0101cc9920fd8628fcdaf0ac35 origin/main`
exited 0. Later main changes are not silently substituted for this specified
source snapshot.

Authoring, optional runtime, and tests were restored from PR #85 head
`7921cfe584d2d6c614da2c4810141a85a1c584c8`. Its old models, metadata, clearance
report, contact sheets, and people-manifest changes were not imported.

The current people assets, six protected Python sources,
`assets/models/manifest.people.json`, and `assets/models/manifest.json` remain
unchanged. The wardrobe remains dormant. Only the original optional rig hook and
the five wear modules are permitted JavaScript changes.

## Eligible residents

The intended inventory is 23 designs × 23 adult/elder fits = 529 combinations:

`m_abuelo`, `m_afro`, `m_carnicero`, `m_don`, `m_elder`, `m_joven`,
`m_mecanico`, `m_mototaxi`, `m_obrero`, `m_panadero`, `m_tendero`,
`m_vendedor`, `w_afro`, `w_ama`, `w_beata`, `w_cocinera`, `w_elder`,
`w_farmaceutica`, `w_joven`, `w_maestra`, `w_peluquera`, `w_tendera`, `w_vecina`.

Excluded CHILD residents: `b_boy`, `g_girl`, `b_escolar`, `g_escolar`.
Excluded TEEN **big** residents: `t_boy`, `t_girl`, `m_rapado`.
None of these seven is an adult fit in this library.

## Verification policy

Run the original complete 32-clip schedule on Node 22.16.0. Preserve all original
tests, tolerances, displacement bounds, and fingerprint checks. New text uses
LF checkout attributes; existing protected text retains the specified
`core.autocrlf=true` checkout bytes. Newly recorded source-input hashes state
their LF or binary form explicitly.

The exact requested base has a 24 MiB texture budget, which is stricter than the
40 MiB budget now on main. No budget is raised. The optional wardrobe must fit
within 6,000,000 compressed model bytes and every far mesh must be at most 40%
of its near mesh. Fresh baseline logs are in `baseline-20261103/`.

Acceptance results and any unverified work will be recorded here after the
fresh build and checks. A failed or incomplete run must not be labelled a
complete certificate.
