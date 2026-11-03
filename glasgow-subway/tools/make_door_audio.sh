#!/usr/bin/env bash
# Rebuilds glasgow-subway/audio/door-open.mp3 and door-close.mp3 from the two recordings they come from (CC BY 4.0, Philt3r, Wikimedia Commons):
#   https://commons.wikimedia.org/wiki/File:London_Underground_1995_Stock_train_doors_opening.ogg
#   https://commons.wikimedia.org/wiki/File:London_Underground_1995_Stock_train_doors_closing.ogg
# usage: tools/make_door_audio.sh <dir holding the two downloaded .ogg files> [out dir (default: glasgow-subway/audio)]
# needs ffmpeg with libmp3lame and rubberband. The changes made (credited in models/credits.json): each is cut to the part where the doors work, mixed to mono, high-passed to
# drop the train's idling rumble, slowed - pitch kept - to the sim's 2.6 s door travel (js/sim/service.js DOOR_TIME), faded at both ends, levelled and encoded as MP3.
set -euo pipefail
src=${1:?usage: make_door_audio.sh <dir with the two .ogg files> [out dir]}
out=${2:-"$(cd "$(dirname "$0")/.." && pwd)/audio"}
secs=2.6; hp=200; fade_in=0.015; fade_out=0.16
mkdir -p "$out"; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# make <name> <source file> <start s> <end s>
make() {
  local name=$1 in=$2 s=$3 e=$4
  local tempo; tempo=$(python3 -c "print(round(($e-($s))/$secs, 5))")
  echo "$name: ${s}s..${e}s of $(basename "$in") -> ${secs}s (tempo $tempo)"
  ffmpeg -v error -y -ss "$s" -t "$(python3 -c "print($e-($s))")" -i "$in" \
    -af "pan=mono|c0=0.5*c0+0.5*c1,highpass=f=${hp}:poles=2,rubberband=tempo=${tempo}:transients=crisp:detector=compound:pitchq=quality:window=short,afade=t=in:d=${fade_in},afade=t=out:st=$(python3 -c "print(round($secs-$fade_out,3))"):d=${fade_out},atrim=0:${secs}" \
    -ar 44100 "$tmp/$name.wav"
  # peak -> -1 dBFS (the level the sim plays it at is a trim in js/sim/audio.js SAMPLES)
  local peak; peak=$(ffmpeg -v info -i "$tmp/$name.wav" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-\?[0-9.]*\) dB.*/\1/p')
  local gain; gain=$(python3 -c "print(round(-1.0 - ($peak), 2))")
  ffmpeg -v error -y -i "$tmp/$name.wav" -af "volume=${gain}dB" -ac 1 -c:a libmp3lame -b:a 96k "$out/$name.mp3"
  echo "  -> $out/$name.mp3  ($(stat -c %s "$out/$name.mp3") bytes, peak was ${peak} dB, gain ${gain} dB)"
}

make door-open  "$src/London_Underground_1995_Stock_train_doors_opening.ogg" 1.88 3.50
make door-close "$src/London_Underground_1995_Stock_train_doors_closing.ogg" 0.05 2.215
