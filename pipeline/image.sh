#!/bin/bash
set -e

PROJECT="$1"
if [ -z "$PROJECT" ]; then
  echo "Usage: pipeline/image.sh <project-name>"
  exit 1
fi

SOURCE_DIR="source/$PROJECT"
DOCS_DIR="docs/$PROJECT"
THUMB_DIR="$DOCS_DIR/thumb"
FULL_DIR="$DOCS_DIR/full"
THUMB_MAX_WIDTH=600

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: source directory '$SOURCE_DIR' not found"
  exit 1
fi

mkdir -p "$THUMB_DIR" "$FULL_DIR"

# Detect platform tools
if command -v cwebp &>/dev/null; then
  USE_CWEBP=1
else
  USE_CWEBP=0
fi

if command -v identify &>/dev/null; then
  USE_IDENTIFY=1
else
  USE_IDENTIFY=0
fi

# Get image dimensions
get_dimensions() {
  local file="$1"
  if [ "$USE_IDENTIFY" = 1 ]; then
    identify -format "%w %h" "$file" 2>/dev/null
  else
    # macOS sips fallback
    local w h
    w=$(sips -g pixelWidth "$file" 2>/dev/null | tail -1 | awk '{print $2}')
    h=$(sips -g pixelHeight "$file" 2>/dev/null | tail -1 | awk '{print $2}')
    echo "$w $h"
  fi
}

# Convert to WebP
to_webp() {
  local input="$1" output="$2" max_width="$3"
  if [ "$USE_CWEBP" = 1 ]; then
    if [ -n "$max_width" ]; then
      # Get dimensions to calculate resize
      local dims
      dims=$(get_dimensions "$input")
      local w h
      w=$(echo "$dims" | awk '{print $1}')
      h=$(echo "$dims" | awk '{print $2}')
      if [ "$w" -gt "$max_width" ]; then
        local new_h=$(( h * max_width / w ))
        cwebp -q 80 -resize "$max_width" "$new_h" "$input" -o "$output" 2>/dev/null
      else
        cwebp -q 80 "$input" -o "$output" 2>/dev/null
      fi
    else
      cwebp -q 80 "$input" -o "$output" 2>/dev/null
    fi
  else
    # macOS sips fallback: convert to a temp file then use sips
    local tmp="${output%.webp}.png"
    cp "$input" "$tmp"
    if [ -n "$max_width" ]; then
      local w
      w=$(sips -g pixelWidth "$tmp" 2>/dev/null | tail -1 | awk '{print $2}')
      if [ "$w" -gt "$max_width" ]; then
        sips --resampleWidth "$max_width" "$tmp" 2>/dev/null
      fi
    fi
    sips -s format webp "$tmp" --out "$output" 2>/dev/null
    rm -f "$tmp"
  fi
}

echo "Processing project: $PROJECT"

# Load metadata if it exists
METADATA_FILE="$SOURCE_DIR/metadata.json"

# Build manifest
ITEMS_JSON="[]"

for file in "$SOURCE_DIR"/*; do
  filename=$(basename "$file")

  # Skip non-image files
  case "$filename" in
    metadata.json|.pipeline|.DS_Store|*.json) continue ;;
  esac

  # Skip directories
  [ -f "$file" ] || continue

  name="${filename%.*}"
  echo "  Processing: $filename"

  # Convert full-size to WebP
  to_webp "$file" "$FULL_DIR/$name.webp"

  # Generate thumbnail
  to_webp "$file" "$THUMB_DIR/$name.webp" "$THUMB_MAX_WIDTH"

  # Get full-size WebP dimensions
  dims=$(get_dimensions "$FULL_DIR/$name.webp")
  w=$(echo "$dims" | awk '{print $1}')
  h=$(echo "$dims" | awk '{print $2}')

  # Get alt text from metadata if available
  alt=""
  if [ -f "$METADATA_FILE" ]; then
    alt=$(python3 -c "
import json, sys
try:
    m = json.load(open('$METADATA_FILE'))
    items = m if isinstance(m, list) else m.get('images', [])
    for item in items:
        if item.get('file','').startswith('$name'):
            print(item.get('alt',''))
            break
except: pass
" 2>/dev/null || true)
  fi

  # Append to items JSON
  ITEMS_JSON=$(python3 -c "
import json, sys
items = json.loads('''$ITEMS_JSON''')
items.append({
    'file': '$name.webp',
    'width': $w,
    'height': $h,
    'alt': '''$alt'''
})
print(json.dumps(items))
")

done

# Write manifest.json
python3 -c "
import json
items = json.loads('''$ITEMS_JSON''')
manifest = {
    'type': 'gallery',
    'project': '$PROJECT',
    'items': items
}
with open('$DOCS_DIR/manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)
print(f'  Wrote manifest.json with {len(items)} items')
"

echo "Done! Output in $DOCS_DIR/"
