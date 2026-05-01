#!/usr/bin/env bash
# Render only the CoffeeSteam view layer for frames 1..96.
# Crops to the middle 25% horizontal slice (full vertical) so Cycles
# only samples that region — meaningful render-time reduction.
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
CROP_MIN_X=0.375
CROP_MAX_X=0.625
CROP_MIN_Y=0.0
CROP_MAX_Y=1.0

CROP_EXPR="r = bpy.context.scene.render; r.use_border = True; r.use_crop_to_border = True; r.border_min_x = ${CROP_MIN_X}; r.border_min_y = ${CROP_MIN_Y}; r.border_max_x = ${CROP_MAX_X}; r.border_max_y = ${CROP_MAX_Y}"

blender "$BLEND_FILE" -b \
    --python-expr "import bpy; [setattr(vl, 'use', vl.name == '${VIEW_LAYER}') for vl in bpy.context.scene.view_layers]; ${CROP_EXPR}" \
    -a -s "$FRAME_START" -e "$FRAME_END"
