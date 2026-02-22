#!/bin/bash
set -e

PROJECT="$1"
if [ -z "$PROJECT" ]; then
  echo "Usage: pipeline/image.sh <project-name>"
  exit 1
fi

echo "Image pipeline not yet implemented. Project: $PROJECT"
exit 1
