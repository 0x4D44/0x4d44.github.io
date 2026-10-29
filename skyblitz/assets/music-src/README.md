# SKYBLITZ music pipeline

Original compositions -> Standard MIDI -> **ferrosintesis** (sampled GM synth, the user's own) -> numeric post -> Ogg Opus adaptive stems.
Nothing here is copied from another game; credits for the synth's embedded sample sets are in `../music/CREDITS.md`.

```
tracks/<id>.mjs   composer: builds a Song (theory.mjs) -> parts with notes, chord progressions, motifs, drum grids, fills
theory.mjs        helpers: note/chord/scale tables, voice leading, Song/Part model, humanise (swing, timing + velocity jitter), drum grids
midi.mjs          SMF format-1 writer (one track per channel + tempo track)
build.mjs         driver:  node build.mjs <menu|sunrise|redrock|neon|frost|results|stingers|all> [--no-render]
post.py           stem balance, loop-tail fold, auto-trim, loudness, Opus encode, meta
verify.py         numeric checks of the shipped files (durations, loudness, true peak, spectrum, seam); prints a markdown table
midi/*.mid        the exported MIDI (committed; the listenable source of truth)
```

## Commands

```
cd skyblitz/assets/music-src
node build.mjs sunrise            # compose -> MIDI -> render (full mix + one solo render per stem, in parallel) -> post -> ../music/sunrise/
node build.mjs sunrise --no-render   # re-run only post.py on existing renders (stem trims, bitrate, loudness)
node build.mjs all
python verify.py                  # numeric verification of everything in ../music
node --test ../../tests/audio.test.mjs      # decodes every stem in headless Chrome vs meta.json (needs the dev server on :8100)
```
Environment: `SKY_SCRATCH` (render scratch dir; WAVs never enter the repo), `FERRO` (path to `ferrosintesis.exe`), `FFMPEG` (ffmpeg with libopus; ffprobe next to it).
Needs Node 22, Python with numpy + scipy. A 32-bar track renders in ~40 s on the dev box.

## Form and stems

Every course/menu track is `intro | A | B | (A2) | build | drop`; the **intro plays once, everything after it loops**.
Each track is delivered as 3-4 **stems of identical length** so they can be layered freely with sample-accurate sync:

| stem | content | game rule (`src/audio/music.js: layerTargets`) |
|---|---|---|
| `base` | drums + bass + rhythm/pad | always; 0.85 on the grid |
| `lead` | the hook / melody | fades in at GO; louder when leading, ducks while tumbling |
| `drive` | energy layer (arps, ostinatos, comping) | rises when chasing, boosting, or under missile warning |
| `final` | brass / choir / octave leads / timpani | final lap only (menu & results use it as a swell) |

Files: `assets/music/<id>/{base,lead,drive,final}.ogg` + `meta.json`
(`bpm, key, introSec, loopSec, introSamples, loopSamples, totalSamples, rate: 48000, stems{file,bytes,gain}, sections, stats`).
`MusicPlayer` starts all stems on the same `AudioContext` time with `loopStart = introSamples/rate`, `loopEnd = totalSamples/rate`.
`drive` and `final` are mono (memory + size); `base` and `lead` are stereo.

## Why post.py does what it does (things that bit us)

* ferrosintesis **normalises every render** (default -18 LUFS). A solo stem would be as loud as the full mix. We render with
  `--peak-normalize` (a *linear* gain) and read the **raw peak** the CLI prints, so `raw_i = out_i * rawPeak_i / 0.891`: the exact
  relative level of every stem. (`--solo` renders are *not* sample-additive - voice/round-robin state shifts - so a waveform
  least-squares fit does not work; an energy NNLS fit is printed as a cross-check and agrees.)
* Raw instrument levels differ wildly, so each stem is then **auto-trimmed** to a target level under `base` (lead -2, drive -4,
  final -3 dB RMS over its active windows; +18 dB max). Drum transients are tamed with a soft clipper before summing.
* The summed stack is scaled to **-17 LUFS** with the peak under -1.5 dBFS (typically -2.5..-4). Music bus gain in game is 0.95 x the setting.
* **Loop seam**: the synth renders `intro + loop + reverb tail`; the tail after the loop end is **mixed onto the start of the loop**
  (`introSec`), so looping back from the end keeps the reverb ringing and the wrap is click-free (`seamRatio` in meta = wrap
  jump / typical sample step, kept well under 40; the wrap lands on a downbeat transient by design).
  A parked silent note on the last tick makes the synth render exactly `intro + loop + tail` (it ends at the last note-off).
* Sample rate is **48 kHz** (Opus decodes at 48 kHz; Chrome's `decodeAudioData` returns exactly `totalSamples` - checked by `tests/audio.test.mjs`).

## Adding / changing a track

1. Copy a track file; set `bpm`, `key`, `sections` (keep an `intro` first) and write chords (`chord('A','min7')`), melodies as
   `[beat, dur, scale-degree]` per bar, drum grids as 16-char strings (`X` accent, `x` normal, `g` ghost, `o` soft).
2. Give each part a `stem` (`base|lead|drive|final`); at most 15 melodic parts + drums (MIDI channels).
3. `node build.mjs <id>`; read the printed `trimsDb` / `seamRatio`; run `python verify.py <id>`.
4. Budget: <= 2 MB per course set, <= 14 MB total (`options.bitrate` per stem if a long track needs it).
