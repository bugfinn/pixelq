#!/usr/bin/env bash
# Scans the PixelQ images with Trivy. Trivy runs from a pinned container image
# (not from a GitHub Action). Fails if a HIGH or CRITICAL vulnerability that has
# a fix is found. Usage: scripts/scan-images.sh [image ...]
#
# Options (environment variables):
#   TRIVY_IMAGE  the Trivy container image to run
set -euo pipefail

cd "$(dirname "$0")/.."

TRIVY_IMAGE="${TRIVY_IMAGE:-ghcr.io/aquasecurity/trivy:0.71.2}"

if [ "$#" -gt 0 ]; then
  IMAGES=("$@")
else
  IMAGES=(pixelq-api:latest pixelq-worker:latest pixelq-gateway:latest)
fi

mkdir -p "$HOME/.cache/trivy"

STATUS=0
for IMAGE in "${IMAGES[@]}"; do
  echo "=== Trivy: $IMAGE ==="
  if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "Image $IMAGE was not found locally." >&2
    STATUS=1
    continue
  fi
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$HOME/.cache/trivy:/root/.cache/trivy" \
    "$TRIVY_IMAGE" image \
    --scanners vuln \
    --severity HIGH,CRITICAL \
    --ignore-unfixed \
    --exit-code 1 \
    --no-progress \
    "$IMAGE" || STATUS=1
done

if [ "$STATUS" -eq 0 ]; then
  echo "TRIVY SCAN PASSED"
else
  echo "TRIVY SCAN FOUND PROBLEMS" >&2
fi
exit "$STATUS"