#!/usr/bin/env bash
# Render only the CoffeeSteam view layer for frames 1..96. Crops to the
# strip defined by STEAM_CROP_{MIN,MAX}_{X,Y} in .env so Cycles only
# samples that region — meaningful render-time reduction.
#
# STEAM_RESOLUTION_MULTIPLIER scales the .blend's render_x/render_y at
# the start of the run so the steam strip lands at higher pixel detail
# than the static beauty pass without changing the .blend on disk. The
# crop and the runtime shader's strip rect are both normalized [0, 1]
# fractions of the full frame, so multiplying resolution preserves the
# overlay's screen-space scale and position — only sharpness changes.
# File-size grows with the square of the multiplier; 4x ≈ 16x atlas
# bytes.
# Usage: ./render_steam.sh <blend-file>
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "usage: $0 <blend-file>" >&2
    exit 1
fi

BLEND_FILE="$1"
FRAME_START=1
FRAME_END=96
VIEW_LAYER="CoffeeSteam"

# Locate the repo root from this script's path so the .env source works
# regardless of where the user invokes the script from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -f "${REPO_ROOT}/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "${REPO_ROOT}/.env"
    set +a
fi

: "${STEAM_CROP_MIN_X:?STEAM_CROP_MIN_X must be set in .env}"
: "${STEAM_CROP_MAX_X:?STEAM_CROP_MAX_X must be set in .env}"
: "${STEAM_CROP_MIN_Y:?STEAM_CROP_MIN_Y must be set in .env}"
: "${STEAM_CROP_MAX_Y:?STEAM_CROP_MAX_Y must be set in .env}"
STEAM_RESOLUTION_MULTIPLIER="${STEAM_RESOLUTION_MULTIPLIER:-4}"

RESOLUTION_EXPR="r.resolution_x = int(round(r.resolution_x * ${STEAM_RESOLUTION_MULTIPLIER})); r.resolution_y = int(round(r.resolution_y * ${STEAM_RESOLUTION_MULTIPLIER}))"
CROP_EXPR="r = bpy.context.scene.render; ${RESOLUTION_EXPR}; r.use_border = True; r.use_crop_to_border = True; r.border_min_x = ${STEAM_CROP_MIN_X}; r.border_min_y = ${STEAM_CROP_MIN_Y}; r.border_max_x = ${STEAM_CROP_MAX_X}; r.border_max_y = ${STEAM_CROP_MAX_Y}; r.filepath = '//renders/steam_beauty/position-'"

blender "$BLEND_FILE" -b \
    --python-expr "import bpy; [setattr(vl, 'use', vl.name == '${VIEW_LAYER}') for vl in bpy.context.scene.view_layers]; ${CROP_EXPR}" \
    -a -s "$FRAME_START" -e "$FRAME_END"
