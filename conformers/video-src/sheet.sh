#!/bin/bash
# Contact sheet of frames at given times (seconds): ./sheet.sh NAME t1 t2 ... (max 12)
# Handy for reviewing layouts without rendering the whole video.
cd "$(dirname "$0")"; n=$1; shift
rm -rf sh_$n; node render.mjs 0 0 sh_$n 8300 $(IFS=,; echo "$*") >/dev/null 2>&1
files=(); for t in "$@"; do files+=(-i sh_$n/t${t/./_}.jpg); done
cnt=$#; cols=4
ffmpeg -loglevel error -y "${files[@]}" -filter_complex "$(for i in $(seq 0 $((cnt-1))); do echo -n "[$i]scale=640:360[s$i];"; done)$(for i in $(seq 0 $((cnt-1))); do echo -n "[s$i]"; done)xstack=inputs=$cnt:layout=$(for i in $(seq 0 $((cnt-1))); do echo -n "$(( (i%cols)*640 ))_$(( (i/cols)*360 ))|"; done | sed 's/|$//')" sheet_$n.jpg
