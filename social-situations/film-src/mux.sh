#!/bin/bash
# frames are drawn at 12 fps (stop-motion "on twos"); output is 24 fps
set -e
DUR=$(python3 -c "import json;print(json.load(open('events.json'))['total'])")
ffmpeg -y -loglevel error -framerate 12 -i frames/%05d.jpg -i mix.wav \
  -filter_complex "[0:v]fps=24,fade=t=out:st=$(python3 -c "print($DUR-1.0)"):d=1.0,format=yuv420p[v];[1:a]atrim=0:$(python3 -c "print($DUR+0.3)"),loudnorm=I=-17:TP=-1.5:LRA=11,aresample=48000,afade=t=out:st=$(python3 -c "print($DUR-0.7)"):d=1.0[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 18 -tune animation -c:a aac -b:a 192k -movflags +faststart -shortest social-situations.mp4
ffmpeg -hide_banner -i social-situations.mp4 2>&1 | grep -E "Duration|Stream"
ffmpeg -hide_banner -i social-situations.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -A8 Summary | grep -E "I:|Peak"
