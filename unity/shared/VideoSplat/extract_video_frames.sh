#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <input_video> <output_frames_dir> [tile_size=256] [fps=30]"
  exit 1
fi

INPUT_VIDEO="$1"
OUTPUT_DIR="$2"
TILE_SIZE="${3:-256}"
FPS="${4:-30}"

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR"/f_*.png

ffmpeg -y -i "$INPUT_VIDEO" \
  -vf "fps=${FPS},crop='min(iw,ih)':'min(iw,ih)',scale=${TILE_SIZE}:${TILE_SIZE}:flags=lanczos" \
  "$OUTPUT_DIR/f_%04d.png"

COUNT=$(ls -1 "$OUTPUT_DIR"/f_*.png 2>/dev/null | wc -l | tr -d ' ')
echo "[VideoSplat] Extracted ${COUNT} frames (${TILE_SIZE}x${TILE_SIZE} @ ${FPS}fps) -> ${OUTPUT_DIR}"
