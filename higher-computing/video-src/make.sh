#!/bin/sh
# Render every explainer: frames (render.mjs) + mix (audio.py) -> ../videos/<id>.mp4, .vtt, .jpg
set -e
cd "$(dirname "$0")"
IDS=${*:-"twos-complement floating-point fetch-execute encryption sql-group-by css-float"}
mkdir -p ../videos
for id in $IDS; do
  node render.mjs "$id" 24
  python3 audio.py "$id"
  ffmpeg -y -loglevel error -i "build/$id/video.mp4" -i "build/$id/mix.wav" -c:v copy -c:a aac -b:a 128k -shortest -movflags +faststart "../videos/$id.mp4"
  cp "build/$id/captions.vtt" "../videos/$id.vtt"
  cp "build/$id/poster.jpg" "../videos/$id.jpg"
done
