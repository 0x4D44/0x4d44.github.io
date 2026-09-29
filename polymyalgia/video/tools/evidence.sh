#!/bin/sh
# Build the critic's evidence pack: contact sheets per scene + audio measurements.
#   tools/evidence.sh <scene-video-dir> <final.mp4> <outdir>
set -e
dir=$1; final=$2; out=$3
rm -rf "$out"; mkdir -p "$out"
here=$(dirname "$0")
for f in "$dir"/S*.mp4; do
  n=$(basename "$f" .mp4)
  "$here/contact.sh" "$f" "$out/$n" 3 >/dev/null
done
{
  echo "== durations (s)"
  for f in "$dir"/S*.mp4; do printf '%s %s\n' "$(basename "$f" .mp4)" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"; done
  printf 'FINAL %s\n' "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$final")"
  echo "== loudness: final mix / narration+sfx stem / ducked music stem"
  for a in "$final" "$(dirname "$final")/vo.wav" "$(dirname "$final")/music_only.wav"; do
    echo "-- $(basename "$a")"
    ffmpeg -hide_banner -nostats -i "$a" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|LRA|Peak):"
  done
} > "$out/metrics.txt"
ls "$out" | wc -l
