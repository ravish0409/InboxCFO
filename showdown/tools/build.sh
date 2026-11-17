#!/usr/bin/env bash
# Build an episode end to end: cue sheet -> soundtrack -> frames (in parallel) -> mp4.
#   tools/build.sh [ep01] [jobs]
set -euo pipefail
cd "$(dirname "$0")/.."
export EP="${1:-ep01}"; JOBS="${2:-4}"
node tools/render.js cues
python3 tools/audio.py
rm -rf out/tmp/frames
for i in $(seq 0 $((JOBS - 1))); do PART="$i/$JOBS" node tools/render.js all & done
wait
N=$(ls out/tmp/frames | wc -l)
mkdir -p out
# H.264 at 24 fps; the mix is normalised to -14 LUFS, the level YouTube plays at
ffmpeg -y -loglevel error -framerate 24 -i out/tmp/frames/f_%05d.jpg -i out/tmp/audio.wav \
  -filter_complex "[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]" -map 0:v -map "[a]" -shortest \
  -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -movflags +faststart "out/$EP.mp4"
echo "$N frames -> out/$EP.mp4"
