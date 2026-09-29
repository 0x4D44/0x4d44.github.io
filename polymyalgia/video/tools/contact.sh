#!/bin/sh
# contact.sh <video> <outprefix> [every_seconds] — tile frames into 4x4 sheets with timestamps
v=$1; out=$2; every=${3:-2}
mkdir -p "$(dirname "$out")"
ffmpeg -loglevel error -y -i "$v" -vf "fps=1/$every,scale=640:-1,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='%{pts\:hms}':x=8:y=8:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=3x3:padding=4" "${out}_%02d.png"
ls "${out}"_*.png
