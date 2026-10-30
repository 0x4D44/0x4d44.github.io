# Soundtrack sources

`songs.mjs` (arrangements in a compact bar/lane notation) -> `gen_music.mjs` -> `midi/<theme>.<stem>.mid`
-> **ferrosintesis** render -> `build_audio.py` (EQ, stem balance, loop fold, Opus) -> `../<theme>/<stem>.ogg`.

    node gen_music.mjs midi/
    # ferrosintesis = https://github.com/0x4D44/ferrosintesis  (cargo build --release -p ferrosintesis-cli)
    ferrosintesis midi/<theme>.<stem>.mid -o wav/<theme>.<stem>.wav --tail 6 2> logs/<theme>.<stem>.log
    #   (the build used a local copy of the CLI that prints the raw peak with 6 decimals instead of 2)
    python3 build_audio.py <work-dir containing midi/ wav/ logs/> <out-dir>

Stems: base (drums, bass, harmony), lead (melody), extra (percussion/arps/bells), boost (horns/doubles).
Each file = intro (played once) + loop body; `meta.json` gives `introSec`/`loopSec`. Not needed at runtime.

## Round 2 (skyway, canyon, highland, mall)

Same flow; `node gen_music.mjs midi/ [theme[,theme...]]` now accepts an optional theme list (default: every theme in `songs.mjs`).
Additions to the toolchain (the first five themes still regenerate byte-identical MIDI):

- `songs.mjs`: a theme may set `steps` (steps per bar; default 16; `highland` uses 12 = two 6/8 jig bars of eighths, bpm = dotted-quarter pulse),
  `kit` (channel-10 program: 24 = synth kit, 40 = brush kit; a drums patch may carry its own `kit`), `vol` (per-theme CC7 overrides per part),
  `patch.cc` (extra CCs at the start of a part), `patch.echo` (CC94 send) and `patch.sweep` (`{cc, def, sec:{section:[from,to]}, pow}`: per-note CC74
  filter ramp across a section - acid line / risers).
- `gen_music.mjs`: more GM voices (`banjo`, `fiddle`, `harmonica`, `accordion`, `whistle`, `mandolin` = program 25 + CC32 96, `upright`, `slapB`,
  `squarelead`, `synbass2`, `warmpad`, `revcym` ...), and the part-name -> stem role sets were extended (see `LEADS`/`EXTRA`/`BOOST`).
- `build_audio.py`: per-theme `THEME_EQ` (skyway tames the synth kit's noisy hats; canyon/highland add acoustic presence), `THEME_MIX` (stem balance
  overrides) and `THEME_TRIM` (dB on the loudness target). All nine themes land at about -17 +- 1 LUFS (all stems summed, as measured with
  ffmpeg ebur128), peaks <= -1.8 dBFS.
- Rendering needs the CLI printing the raw peak with 6 decimals (`peak {:.6}` in `crates/ferrosintesis-cli/src/main.rs`), as before.
- Balancing without ears: render each part solo (`--solo CH`, channel numbers in `midi/<theme>.json`), recover the pre-normalisation level from
  the log's raw peak, and compare the active RMS with the old themes (drums ~ -15, bass ~ -23, rhythm/pads ~ -33, melody ~ -32 dB re full scale
  before the stem mix); then compare the 8-band spectrum of the packed mix with the old themes.
