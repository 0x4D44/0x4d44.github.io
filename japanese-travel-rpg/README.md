# Nihon Quest — Japanese Travel RPG

A complete static, mobile-first Japanese language-learning PWA for the 0x4D44 Almanac site.

## What it includes

- UK-to-Japan journey map with main route and side quests.
- Travel journal/passport, stamps, avatar customisation and guide characters.
- Structured lessons with explanations before practice.
- Kana refreshers and practical kanji/sign recognition.
- Searchable phrasebook with politeness, kana, romaji help and audio buttons.
- Scripted speaking roleplays for every chapter, fully offline.
- Optional BYO-key AI roleplay using a local browser-stored key; the core app never requires AI.
- SRS review cards for phrases and signs, with daily and deep-study modes.
- Local progress persistence using IndexedDB with a localStorage fallback.
- PWA manifest and service worker caching for offline GitHub Pages use.

## Run locally

```bash
cd japanese-travel-rpg
npm test
npm run build
npm run serve
```

Then open `http://localhost:4173/`.

No install step is required because there are no runtime or build dependencies.

## Deployment

The folder is already static. GitHub Pages can serve it directly at:

`https://0x4d44.github.io/japanese-travel-rpg/`

## Privacy note

AI roleplay is disabled by default. If the learner supplies an API key, it is saved only in the browser's local storage layer. Requests are sent directly from the browser to the configured provider endpoint. The Almanac site has no backend and never receives the key.
