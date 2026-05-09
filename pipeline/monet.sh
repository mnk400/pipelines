#!/bin/bash
set -e

PROJECT="$1"
if [ -z "$PROJECT" ]; then
  echo "Usage: pipeline/monet.sh <project-name>"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DIR="$ROOT/source/$PROJECT"
DOCS_DIR="$ROOT/docs/$PROJECT"

cd "$SOURCE_DIR"

# Fetch Wikidata painting metadata (SPARQL).
node fetch-wikidata.js

# Resolve P18 filenames to Commons URLs (thumb + full) via batched imageinfo.
node fetch-images.js

# Assemble manifest, classify series, drop image-less records.
mkdir -p "$DOCS_DIR"
OUT_DIR="$DOCS_DIR" node build-manifest.js

echo "Done. docs/$PROJECT/manifest.json updated."
