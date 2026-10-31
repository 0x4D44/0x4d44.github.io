# FEATURE: open the wardrobes, drawers and cupboards (user request, 2026-10-29 21:58)

The user (Arthur or Edmund; they are away, no questions) asked, verbatim:
1. "Can you make it so that you can open wardrobes and drawers and cupboards? And have them filled with things you can interact with? Maybe have some journals and diaries in the drawers giving an insight into the people's lives - their loves, hopes, dreams, challenges, problems etc?"
2. "And include special items to find in the drawers and wardrobes? A gold coin, or a fancy watch or a pair of frilly knickers!"

This outranks the rubric chase. It lifts categories 3 (interiors), 9 (discovery), 5 (interaction) and 4 (people, by implication). It comes right after A3's sit fix (P0) and the R2 stuck pockets; the fixture invariants and shop fit-outs stay in the queue because a container system needs the furniture to have real, hollow carcasses anyway.

## Who does what

| who | owns |
|---|---|
| A3 | the container system (`js/interiors/containers.js`), slot definitions per catalog item, hollow carcasses + openable fronts for stand-ins AND the Blender heroes (named parts), lazy contents (`js/interiors/contents.js`), placement/distribution rules, discovery hooks, tests |
| A1 | the reader panel (paper sheet, pages, ES/EN per `subLang`, read-aloud key), Esc/mode handling (Esc closes only the reader; also fixes R2-005), journal tab 'Papeles y hallazgos' with collection counters, sounds (drawer slide, wardrobe creak, paper rustle, coin chime), interaction targeting so the exact aimed slot/prop wins (R4-009) |
| lead | the writing: `js/interiors/papers.js` (diaries, letters, notes, lists: bilingual) and `js/interiors/finds.js` (special finds + reactions). A3 and A1 read these files and never edit them; ask the lead for changes in `dev/REQUESTS.md` |
| A4 | after the people swap: the Spanish review of papers/finds (with R3), and resident reactions ('¡Eso es privado!') when someone is in the room while a container is opened |
| A5 | only if the discovery API needs a 'found by interaction' call (`ctx.discover` marks found by proximity today) |

## What the player experiences

- Look at a wardrobe door, a drawer front, a cupboard door, a nightstand drawer, the dresser, the kitchen cupboards, a cash drawer, a locker, a tool cabinet: the prompt says 'Abrir cajón' / 'Abrir puerta' / 'Abrir el armario' / 'Abrir la alacena'. E opens it with a short animation (drawer slides out 0.35 m, hinged door swings ~100 degrees, about 0.3 s) and a sound.
- The inside is visible and filled: 3-8 small objects drawn in the drawer or on the shelves (folded shirts, hangers with a school uniform and a quinceanera dress in plastic, shoe boxes, a Danish-cookie tin full of sewing things, plates and tin cups, rice and panela, a rosary, a pillbox, a deck of cards, a parques board, old cassettes, a cheque book, photo albums, a school report). Each object is its own target: 'Examinar' gives one bilingual line (Spanish + English subtitle like the rest of the game).
- Some objects are readable: 'Leer el diario' / 'Leer la carta' opens the reader (a sheet of paper in the user's chosen language mode: Spanish, English or both), one entry per page, page keys, Esc closes the reader only.
- Some are special finds (see below): a rich toast 'Hallazgo' with a chime, counted in the journal and in collections.
- E again (aiming at the open slot's frame/front) closes it. Everything closes by itself when the player leaves the building.
- Shops: the cash drawer under the counter (small notes and coins, the 'libreta de fiado' with neighbours' debts), the shelf cupboards. Clinic: the med cabinet. School: lockers, the confiscated-things drawer. Workshop: tool drawers. The fridge ('Abrir la nevera' exists today but shows a line only) should open for real with the same system if time allows (bonus).

## Contents and what is special

- Mundane objects are ~65 % of what you find, personal papers ~15-20 %, special finds are rare (a few per hundred slots).
- Deterministic: contents depend only on (building id, furniture index, slot index, household seed), so a reload shows the same drawers.
- Household-aware: `hh` (`js/interiors/household.js`: kind family|couple|students|elder|shopkeeper, income 0|1, kids, babies, teen, elder, religious, altar, pets, hobby, team, names {woman, man, sur, kid, kid2}) picks the pool: a teenager's wardrobe has a football shirt and posters, an elder's has a mantilla and a rosary, a shopkeeper's has ledgers and price guns.
- Every home building holds at least one readable paper (>= 100 of the 110 buildings), no paper repeats more than twice in the whole barrio, no more than 3 special finds per building.
- Special finds are described in `js/interiors/finds.js` (id, ES/EN name, kind treasure|curio|funny|keepsake, which containers, rarity, barrio-wide min/max, one bilingual reaction line each). They include (the user named the first three): a gold coin (a 'centenario'), a fancy wristwatch, a pair of frilly knickers (played for a light, PG laugh), a pocket watch, a gold chain with a medal, an engagement ring, a roll of dollars in a sock, a title deed, a lottery ticket, false teeth in a glass, a love letter with ribbon, a child's treasure map, a signed football shirt, and more. Collections shown in the journal: Monedas de oro, Relojes, Joyas, Rarezas. 'Finding' means you have seen it and read its line: nothing is taken or removed, no inventory.

## Papers (data contract: `js/interiors/papers.js`)

```js
export const PAPERS = [{
  id: 'dia_camila',                 // unique
  kind: 'diary',                    // diary | letter | note | list | card | receipt | ledger | postcard | certificate | clipping
  title: 'Diario de Camila', en: "Camila's diary",
  who: 'Camila',                    // author as written; may use tokens below
  cover: 'notebook',                // notebook | school | leather | loose | envelope | card | ledger | postcard  (drives the paper look)
  where: ['nightstand', 'dresser', 'wardrobe'],      // container kinds it may sit in
  homes: { kind: ['family'], teen: true },            // household filters (any subset of hh fields; omitted = any)
  themes: ['love', 'hope'],         // love | hope | dream | challenge | problem | joy | humour | faith | memory | secret
  pages: [{ when: '3 de marzo', es: '...', en: '...' }]   // 1-6 pages, both languages required, <= 90 words each
}];
```
Tokens usable in any string: `{W}` the household's woman, `{M}` the man, `{S}` the surname, `{K}` and `{K2}` the children, `{T}` the team colours (`hh.names`, `hh.team.n`).
Rules for the content: warm, specific, local (Colombian Andean barrio: the stairs, the court, the viewpoint, the chapel, the shops of `js/world/names.js`), humane, never sensational; hardship and joy side by side; no real brands or clubs; PG.

## Budgets and rules

- Boot: no measurable cost (everything lazy). Draw calls: at most +1 per visible building for the openable fronts (an InstancedMesh per building like the fan rotors in `anim.js`) and at most +3 for an open container's contents (merged); triangles +0.5 % at most.
- `CAP_INTERACT = 44` per building in `stories.js` was sized before this: raise it or register slots lazily by proximity, but never let E target the wrong object (R4-009: the aimed slot or prop wins).
- Physics: the swing of a door never traps or pushes the player (visual only; colliders stay on the closed outline); contents are not colliders.
- Quiet-box rules (headless, low priority) for every test.

## Acceptance (what the node/page tests and the reviewers will check)

1. Data: all `PAPERS`/`FINDS` ids unique, ES and EN present on every page/line, <= 90 words per page, tokens resolve, `where` kinds exist, themes valid; >= 70 distinct papers; each theme >= 8; >= 40 finds with >= 6 gold coins, >= 6 watches (>= 2 fancy), >= 5 frilly-knickers instances, >= 20 curios.
2. Placement: >= 100 buildings with a readable; no paper > 2 uses; <= 3 finds per building; deterministic across two builds; matching household filters.
3. Page: enter a building, face a wardrobe, E opens it (instance matrix changes, contents targets registered), E on a paper opens the reader, pages turn, Esc closes only the reader, closing the slot unregisters its contents, leaving the building closes everything, no console error, draw-call delta within budget; a special find shows the toast, marks the discovery and updates its collection counter.
4. Coverage: >= 90 % of the storage furniture in finished buildings is openable (wardrobes, dressers, nightstands, kitchen cupboards, tv stands, cabinets).
5. Each new test fails once when its feature is broken (revert/mutate on a copy), as always.

## Content delivered by the lead (read it, never edit it; ask in REQUESTS.md)

Files (pure ES modules, no three.js, safe in node and in the page):
- `js/interiors/content.js`: the vocabulary and the helpers. `eligible(item, hh, lot, container)` is THE filter (container kind, lot kind, shop, household, voice); `resolvePaper(p, hh)` and `resolveFind(f, hh)` return copies with every token filled (`{A}` the author = the resident the paper's `voice` names, `{W} {M} {S} {K} {K2} {T}`); `authorOf`, `fill`, `genderOf`, `wordCount`, `collectionLabel(id, lang)`, `rarityWeight(find)`, `RARITY_WEIGHTS`. The schema of a paper and of a find is documented at the top of this file and of `finds.js`.
- `js/interiors/papers.js`: `PAPERS` (merged from `papers_a.js`, `papers_b.js` and `papers_c.js`: 75 papers, every theme >= 8, every kind of building and container has something), `papersFor(hh, lot, container)`, `paperById`.
- `js/interiors/finds.js`: `FINDS` (64 types today: 10 gold coins, 9 watches of which 3 fancy, 6 frilly-knickers, 21 curios, 93 placements at minimum), `findsFor(hh, lot, container)`, `findById`, `FIND_SHAPES` and `FIND_WRAPS` (what to draw), `FIND_COLLECTIONS` (the journal's four shelves).
- `tests/interiors-content.test.mjs` (pure node, ~3 s): the data contract and the promised volume, all hard. Each check was proven by corrupting the data on purpose (`C_SABOTAGE=...`, see the file header).

How to use them (A3, placement):
1. A container slot gets: mundane objects (yours), maybe ONE paper (`papersFor(hh, lot, kind)` minus papers already used twice in the barrio), maybe ONE find (`findsFor(...)`). Papers and finds are deterministic: draw with an rng seeded from (building id, furniture index, slot index, hh.seed).
2. A find's `min`/`max` are barrio-wide: when every building has been built, the number of placements of each find must lie in [min, max] (best effort for `min` where the homes allow it; never above `max`). Weighted draw by rarity `[10, 5, 2, 1][rarity - 1]`; at most 3 finds per building; at most 1 find per container; the special lots (`lot: [...]`) always get theirs first.
3. Draw a find as its `shape`/`tint`/`size` (and `in`, the thing it sits in: a sock, a matchbox, a velvet box...) when you have no better model. Shapes are a closed list; unknown means a small box.
4. Reading a paper: `resolvePaper` first; `pages[i].es` / `.en` by `subLang`; `title`, `who`, `when` are the page header; `cover` picks the paper look (notebook, school exercise book, leather, loose sheet, envelope, card, ledger, postcard); `kind` the verb ('Leer el diario', 'Leer la carta', 'Leer la nota', 'Ver la lista', 'Ver el recibo'...).
5. Finding a find: toast `{ tag: 'Hallazgo', title: name[lang], sub: react[lang] }`, subtitle with `react` (ES + EN), discovery kind 'find' keyed by the find's id, and a counter per `collection`. Nothing is taken. `rarity` 3 and 4 get the bigger chime.
6. `household.js`: `names.kid2` can equal `names.kid` (1 in 12); please draw kid2 from the pool without kid, so `{K}` and `{K2}` differ. New first names in `NAMES` must also go into `content.js` (the test says so).
7. Container kinds (RECONCILED 22:41, they are A3's words from `dev/REQUESTS.md`, 22:10; the data was migrated and `tests/interiors-content.test.mjs` locks the list): nightstand, dresser, wardrobe, chest, tvstand, wallunit, vitrine, pantry, kitchen, fridge, desk, counter, locker, medcab, toolcab, filing. Every `where` in `papers_*.js` and `finds.js` uses only these.
8. Filters: use `eligible(item, hh, lot, container)` / `papersFor` / `findsFor`, do NOT re-implement the `homes` evaluation (it has thresholds: `kids: 1` means at least one child, `religious: 0.5` means at least that devout; `kidG`, arrays of alternatives, `voice`). Pass the lot as `{ kind: lot.kind, shop: <the building's shop type> }` (`shop` is matched against `lot.shop`, or `lot.shopType`). The filter keys are `kind income kids teen elder babies religious altar rustic hobby pets kidG`.
9. Reading a find (the field mapping to your `findInfo`): `const r = resolveFind(f, hh)` fills every token; then `es = r.name.es`, `en = r.name.en`, `react = [r.react.es, r.react.en]`, `collection = collectionLabel(f.collection)` ('coins' -> 'Monedas de oro'; `collectionLabel(id, 'en')` for English), placement weight `rarityWeight(f)` (rarity 1 common .. 4 legendary -> 10, 5, 2, 1; it is NOT a 0..1 number), `f.min` / `f.max` barrio-wide, `f.shape` (below), `f.tint`, `f.size` (longest side in metres; a hint, scale as you like), `f.in` (how it sits: a hint, ignore it if you have no model), `f.gold` / `f.fancy` booleans. The paper side: `resolvePaper(p, hh)` gives `{ id, kind, cover, themes, title, en, who, pages: [{ when, es, en }] }`: build your `doc` from it (`title: { es: r.title, en: r.en }`).
10. Find shapes are your drawing words, plus `ball` (a marble; if you do not draw it, `box` is fine): coin, watch, pocketwatch, ring, chain, roll, teeth, deed, ticket, letter, map, shirt, knickers, jar, box, doll, key, medal, photo, ball. Where a find has no exact word it uses the nearest one (a gold nugget is a tinted `box`, a wig is a tinted `roll`, an alarm clock a `pocketwatch`).
