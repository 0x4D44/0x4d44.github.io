# Door sounds: where they come from and how they were made

What the sim plays when doors work: the **opening** (a two-note chime, the door motor, a clunk) and the **closing** (warning beeps, the door motor, a clunk), each lasting the 2.6 s the leaves take (`DOOR_TIME` in `js/sim/service.js`), heard from each doorway of each train with distance, muffling and stereo position (`reach` / `panOf` in `js/sim/audio.js`).

## Not from YouTube
A video's soundtrack belongs to its uploader or to whoever they took it from, YouTube's terms do not allow downloading it, and this repository and site redistribute everything they use. The credits page promises "everything used is CC0 or CC-BY", which a YouTube clip with no explicit licence cannot meet. If you own a recording, or have a link that says CC0 / CC-BY, it can go in the same way as below.

## What was looked at
| Place | Result |
|---|---|
| Wikimedia Commons | Found real door recordings with usable licences (below). The shipped pair is from here. |
| archive.org (CC0 collections) | Subway ambience, but no door beeps in the clips checked. |
| OpenGameArt | Nothing that fits a train's doors. |
| Freesound | Blocked from the build environment; not used. |

Other Commons candidates, not used: "Tram doors open and close hiss and beeping" (public domain, stephan), "Train automatic inner door opening closing 02" and "Train doors closing" (public domain, ezwa), "OER 5200 Chime Door open and close" (public domain, Cassiopeia sweet), "WWS Metro" (CC BY 4.0, Work With Sounds). The tram one (the closest to a Glasgow-style beep) could not be fetched in time because Wikimedia throttled downloads from the build machine.

## What ships (`audio/door-open.mp3`, `audio/door-close.mp3`)
Both from Philt3r's London Underground **1995 Stock** recordings, Wikimedia Commons, **CC BY 4.0** (credited in `models/credits.json` and on `credits.html`):
- `File:London_Underground_1995_Stock_train_doors_opening.ogg`: measured here as a note at about 1.95 kHz (0.5 s), then one at about 2.72 kHz, with the sound of the leaves moving (a steady tone near 540 Hz sits under it) and a clunk as they stop.
- `File:London_Underground_1995_Stock_train_doors_closing.ogg`: a pulsed tone at about 2.23 kHz (about 6 beeps a second) running while the leaves close, then on for another second.

Rebuild with `tools/make_door_audio.sh <folder with the two .ogg files>` (needs ffmpeg with `libmp3lame` and `rubberband`). The changes, which CC BY asks to be stated:
- cut to the part where the doors work (opening 1.88-3.50 s of the source, closing 0.05-2.215 s, ending between two beeps);
- mixed to mono (so the stereo position comes from the sim), high-passed at 200 Hz (the idling rumble sits below that);
- **slowed to 2.6 s** with `rubberband` (pitch kept: the tones were re-measured afterwards and stay within about 1 % of their source pitch). The real doors take 1-2 s, the sim's take 2.6 s, so the opening is stretched about 1.6x (a slow "ding... dooong") and the closing about 1.2x (beeps come about 5 a second instead of 6). The clunk lands roughly 0.4 s before the leaves finish;
- faded at both ends, peak-normalised to -1 dBFS, MP3 at 96 kbps (about 32 kB each).

`SAMPLES[...].gain` in `js/sim/audio.js` is the level trim (0.32 / 0.4): the loudest second of each, as played, sits within about 3 dB of the synthesised sound it replaces (the end-to-end test checks this stays within 6 dB).

## Fallback and A/B
The synthesised versions (`synthDoorOpen`, `synthDoorClose`) are always available: they play until the recordings have loaded, if a file is missing or cannot be decoded, and for good with **`?sfx=synth`** on the address. That switch is the quickest way to compare.

## Limits
- These are London Underground sounds, not the Glasgow Subway's own; the beep and chime are generic, not matched to the Stadler trains.
- Nobody has *listened* to the result from inside the build environment: levels, timing, pitch and spectra were measured, tone and balance were not judged by ear. Tune `gain`, the cut points in the script, or fall back to `?sfx=synth` as needed.
- The rest of the audio (motor, rumble, squeal, brake hiss, the platform bell, rat squeaks) is still synthesised.
