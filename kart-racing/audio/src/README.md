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
