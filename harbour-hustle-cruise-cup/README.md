# Harbour Hustle: Cruise Cup

A colourful, cartoon-style cruise boat racing simulator for static sites.

## What it includes

- Build-a-ship dockyard with four part slots: hull, engine, deck, gadget.
- Race progression across six events.
- Win races to unlock new parts and improve stats.
- Local high-score table with captain name, place, time, and score.
- Local save/progression using `localStorage`.
- Import/export save codes for moving a save between browsers.
- Keyboard and touch controls.
- No dependencies, no build step, and no external assets.

## Controls

- `↑` / `W`: steer up
- `↓` / `S`: steer down
- `Space`: boost
- On mobile/tablet, use the on-screen controls or drag/tap on the race canvas to steer.

## GitHub Pages integration

Copy this folder into your `0x4d44.github.io` repository, for example:

```text
0x4d44.github.io/
  almanac/
  games/
    harbour-hustle-cruise-cup/
      index.html
      styles.css
      game.js
```

Then link to it from your almanac:

```html
<a href="/games/harbour-hustle-cruise-cup/">Play Harbour Hustle: Cruise Cup</a>
```

Because this is a static app, the high-score table is browser-local. A global online leaderboard would need a backend service or a GitHub-backed workflow.

## Files

- `index.html` — app markup and dialogs
- `styles.css` — cartoon UI, responsive layout, race modal styles
- `game.js` — game data, progression, save system, canvas racing loop

## Customisation ideas

- Add your almanac header/footer around the app shell.
- Rename the save key in `game.js` if you want multiple save slots.
- Add more races in the `RACES` array.
- Add more ship parts in the `PARTS` object.
- Tune physics in `derivePhysics()`.
