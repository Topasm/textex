#!/usr/bin/env bash
# Capture README media from a running TextEx window on X11/Xwayland with ffmpeg.
#
#   capture.sh shot NAME            -> docs/images/NAME.png  (downscaled to $SHOT_WIDTH)
#   capture.sh rec NAME SECONDS     -> $MEDIA_DIR/NAME.mp4 then docs/images/NAME.gif
#   capture.sh gif NAME [SEGMENTS]  -> rebuild docs/images/NAME.gif from $MEDIA_DIR/NAME.mp4
#                                      SEGMENTS "0-4:1,4-14:6" = seconds range : speed factor
#
# Env: DISPLAY (default :1), WINDOW_ID (default: largest TextEx window),
#      SHOT_WIDTH (1800), GIF_WIDTH (1200), GIF_FPS (12), MEDIA_DIR (scratch for mp4).
set -euo pipefail
export DISPLAY="${DISPLAY:-:1}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/docs/images"
MEDIA_DIR="${MEDIA_DIR:-$ROOT/out/readme-media}"
SHOT_WIDTH="${SHOT_WIDTH:-1800}"
GIF_WIDTH="${GIF_WIDTH:-1200}"
GIF_FPS="${GIF_FPS:-12}"
mkdir -p "$OUT" "$MEDIA_DIR"

window_id() {
  if [[ -n "${WINDOW_ID:-}" ]]; then echo "$WINDOW_ID"; return; fi
  xwininfo -root -tree | awk '/"TextEx"/ && /textex-tauri/ { print $1; exit }'
}

case "${1:-}" in
  shot)
    name="$2"; wid="$(window_id)"
    tmp="$MEDIA_DIR/$name.raw.png"
    ffmpeg -loglevel error -y -f x11grab -draw_mouse 0 -window_id "$wid" -i "$DISPLAY" -frames:v 1 "$tmp"
    ffmpeg -loglevel error -y -i "$tmp" -vf "scale=${SHOT_WIDTH}:-2:flags=lanczos" "$OUT/$name.png"
    echo "wrote $OUT/$name.png ($(du -h "$OUT/$name.png" | cut -f1))"
    ;;
  rec)
    name="$2"; seconds="$3"; wid="$(window_id)"
    ffmpeg -loglevel error -y -f x11grab -framerate 15 -window_id "$wid" -i "$DISPLAY" -t "$seconds" -vf "crop=trunc(iw/2)*2:trunc(ih/2)*2" \
      -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p "$MEDIA_DIR/$name.mp4"
    "$0" gif "$name"
    ;;
  gif)
    # Optional third argument: segments with speed factors, e.g. "0-4:1,4-14:6,14-20:1"
    # (seconds in the source mp4; a factor of 6 plays that stretch six times faster).
    name="$2"; src="$MEDIA_DIR/$name.mp4"; segments="${3:-}"
    pre=""
    if [[ -n "$segments" ]]; then
      i=0; chain=""; labels=""
      IFS=',' read -ra parts <<< "$segments"
      for part in "${parts[@]}"; do
        range="${part%%:*}"; speed="${part##*:}"
        start="${range%%-*}"; end="${range##*-}"
        chain+="[0:v]trim=start=${start}:end=${end},setpts=(PTS-STARTPTS)/${speed}[s${i}];"
        labels+="[s${i}]"; i=$((i + 1))
      done
      pre="${chain}${labels}concat=n=${i}:v=1:a=0[cut];[cut]"
    else
      pre="[0:v]"
    fi
    filters="fps=${GIF_FPS},scale=${GIF_WIDTH}:-2:flags=lanczos"
    ffmpeg -loglevel error -y -i "$src" -lavfi "${pre}${filters},palettegen=max_colors=128:stats_mode=diff[p]" -map "[p]" "$MEDIA_DIR/$name.palette.png"
    ffmpeg -loglevel error -y -i "$src" -i "$MEDIA_DIR/$name.palette.png" \
      -lavfi "${pre}${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[g]" -map "[g]" "$OUT/$name.gif"
    echo "wrote $OUT/$name.gif ($(du -h "$OUT/$name.gif" | cut -f1))"
    ;;
  *)
    sed -n '2,10p' "$0"; exit 1 ;;
esac
