#!/bin/bash
set -e

PROJECT="$1"
shift || true
if [ -z "$PROJECT" ]; then
  echo "Usage: pipeline/paintings.sh <project-name> [artist-slug...]"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DIR="$ROOT/source/$PROJECT"
DOCS_DIR="$ROOT/docs/$PROJECT"
PIPELINE_DIR="$ROOT/pipeline/paintings"
CONFIG_DIR="$SOURCE_DIR/artists"

if [ ! -d "$CONFIG_DIR" ]; then
  echo "Artist config directory not found: $CONFIG_DIR"
  exit 1
fi

if [ "$#" -gt 0 ]; then
  CONFIGS=()
  for SLUG in "$@"; do
    CONFIGS+=("$CONFIG_DIR/$SLUG.json")
  done
else
  CONFIGS=("$CONFIG_DIR"/*.json)
fi

LAST_CONFIG_INDEX=$((${#CONFIGS[@]} - 1))
STEP_THROTTLE_SECONDS="${PAINTINGS_STEP_THROTTLE_SECONDS:-5}"
ARTIST_THROTTLE_SECONDS="${PAINTINGS_ARTIST_THROTTLE_SECONDS:-30}"

run_network_step() {
  ARTIST_CONFIG="$CONFIG" DATA_DIR="$DATA_DIR" node "$PIPELINE_DIR/$1"
  sleep "$STEP_THROTTLE_SECONDS"
}

for INDEX in "${!CONFIGS[@]}"; do
  CONFIG="${CONFIGS[$INDEX]}"
  if [ ! -f "$CONFIG" ]; then
    echo "Artist config not found: $CONFIG"
    exit 1
  fi

  SLUG="$(node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(c.artist.slug || c.artist.name.toLowerCase().replace(/\s+/g, "-"));' "$CONFIG")"
  DATA_DIR="$SOURCE_DIR/data/$SLUG"
  OUT_DIR="$DOCS_DIR/$SLUG"

  echo "==> Building paintings/$SLUG"
  mkdir -p "$DATA_DIR" "$OUT_DIR"

  run_network_step "fetch-wikidata.js"
  run_network_step "fetch-commons-gallery.js"
  run_network_step "fetch-pageviews.js"
  run_network_step "fetch-images.js"
  ARTIST_CONFIG="$CONFIG" DATA_DIR="$DATA_DIR" OUT_DIR="$OUT_DIR" node "$PIPELINE_DIR/build-manifest.js"

  echo "Done. docs/$PROJECT/$SLUG/manifest.json updated."

  if [ "$INDEX" -lt "$LAST_CONFIG_INDEX" ]; then
    sleep "$ARTIST_THROTTLE_SECONDS"
  fi
done
