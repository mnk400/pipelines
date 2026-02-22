#!/bin/bash
set -e

PROJECT="$1"
if [ -z "$PROJECT" ]; then
  echo "Usage: pipeline/lastfm.sh <project-name>"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DIR="$ROOT/source/$PROJECT"
DOCS_DIR="$ROOT/docs/$PROJECT"

cd "$SOURCE_DIR"

# Fetch
node fetch-data.js
node fetch-scrobbles.js
node fetch-artist-listeners.js

# Analyze
node analyze-genre-drift.js
node analyze-3am.js
node analyze-mainstream.js

# Export trimmed JSON to docs
mkdir -p "$DOCS_DIR/processed"
OUT_DIR="$DOCS_DIR/processed" node export.js

# Write manifest
cat > "$DOCS_DIR/manifest.json" << 'MANIFEST'
{
  "type": "data",
  "files": [
    { "name": "genre-drift.json", "dir": "processed", "description": "Monthly genre breakdown" },
    { "name": "3am-analysis.json", "dir": "processed", "description": "Hourly listening patterns" },
    { "name": "mainstream-analysis.json", "dir": "processed", "description": "Obscurity trends" }
  ]
}
MANIFEST

echo "Done. docs/$PROJECT/ updated."
